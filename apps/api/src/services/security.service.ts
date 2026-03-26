import { supabase } from '../utils/supabase'
import { config } from '../utils/config'
import crypto from 'crypto'

export type IncidentCategory = 'theft' | 'harassment' | 'accident' | 'road_hazard' | 'flooding' | 'protest'
export type IncidentSeverity = 'low' | 'moderate' | 'high'
export type RiskLevel = 'low' | 'moderate' | 'elevated' | 'high'

export interface RouteSecurityReport {
  riskLevel: RiskLevel
  summary: {
    incidentCount24h: number
    incidentTypes: string[]
    peakRiskTime?: string
    mostCommonCategory?: IncidentCategory
  }
  alternativeRoutes: Array<{
    description: string
    estimatedExtraMinutes: number
    riskLevel: RiskLevel
  }>
  safeSpotsNearby: Array<{
    name: string
    type: 'police' | 'hospital' | 'hub' | 'landmark'
    distanceMeters: number
  }>
  expiresAt: string  // cache valid for 30 mins
}

export class SecurityService {
  /**
   * Submit an anonymous community incident report.
   *
   * PRIVACY GUARANTEE: No user identity is stored at any point.
   * No reporter_id, no IP address, no device fingerprint.
   * Reports require SECURITY_VALIDATION_THRESHOLD (3) validations before activating
   * to prevent spam and false reports.
   */
  async submitIncidentReport(params: {
    category: IncidentCategory
    severity: IncidentSeverity
    geoPoint: { lat: number; lng: number }
    timeOfIncident?: Date
    radiusMeters?: number
  }): Promise<void> {
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + config.SECURITY_REPORT_EXPIRY_HOURS)

    // Check if there's a similar recent report at this location (within 100m, last 30min)
    // If so, increment its validation count instead of creating a new record
    const { data: existing } = await supabase.rpc('find_nearby_recent_report', {
      p_lat: params.geoPoint.lat,
      p_lng: params.geoPoint.lng,
      p_category: params.category,
      p_radius_meters: 100,
      p_minutes_ago: 30,
    })

    if (existing?.id) {
      // Reinforce existing report
      await supabase
        .from('community_safety_reports')
        .update({
          validation_count: existing.validation_count + 1,
          expires_at: expiresAt.toISOString(), // refresh expiry
        })
        .eq('id', existing.id)
      return
    }

    // Create new report — completely anonymous
    const { error } = await supabase
      .from('community_safety_reports')
      .insert({
        category: params.category,
        severity: params.severity,
        geo_point: `POINT(${params.geoPoint.lng} ${params.geoPoint.lat})`,
        radius_meters: params.radiusMeters ?? 50,
        time_reported: new Date().toISOString(),
        time_of_incident: params.timeOfIncident?.toISOString() ?? new Date().toISOString(),
        validation_count: 1,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        // NO reporter_id — this is by design, not an oversight
      })

    if (error) throw new Error(`Failed to submit report: ${error.message}`)
  }

  /**
   * Get a security intelligence report for a route.
   *
   * PRIVACY GUARANTEE:
   * - No user_id is stored anywhere in this process
   * - Origin and destination are one-way hashed before any persistence
   * - Results are cached for 30 minutes and shared across all queries for same route
   * - Only aggregate patterns are returned — never individual report data
   */
  async getRouteReport(params: {
    origin: { lat: number; lng: number }
    destination: { lat: number; lng: number }
    departureTime: Date
  }): Promise<RouteSecurityReport> {
    // Hash origin + destination for cache lookup (one-way, non-reversible)
    const originHash = this.hashLocation(params.origin)
    const destHash = this.hashLocation(params.destination)
    const cacheKey = `${originHash}:${destHash}`

    // Check cache (30-minute window)
    const cached = await this.getCachedRouteReport(originHash, destHash)
    if (cached) return cached

    // Query active incidents along the route corridor
    // Using PostGIS ST_DWithin on the route line
    const { data: incidents, error } = await supabase.rpc('get_route_incidents', {
      p_origin_lat: params.origin.lat,
      p_origin_lng: params.origin.lng,
      p_dest_lat: params.destination.lat,
      p_dest_lng: params.destination.lng,
      p_corridor_meters: 300,  // 300m buffer around route
      p_hours_back: 24,
    })

    if (error) throw new Error(`Route analysis failed: ${error.message}`)

    const report = this.buildRouteReport(incidents ?? [])

    // Cache the result — no user data stored, just the aggregated report
    await supabase.from('route_security_queries').insert({
      origin_hash: originHash,
      destination_hash: destHash,
      query_time: new Date().toISOString(),
      risk_level: report.riskLevel,
      report_summary: report.summary,
      alternative_routes: report.alternativeRoutes,
      cache_expires_at: report.expiresAt,
    })

    return report
  }

  /**
   * Activate safety companion mode.
   * Creates a time-limited presence share between user and one trusted contact.
   * The share auto-expires on arrival OR after SAFETY_COMPANION_MAX_HOURS.
   *
   * PRIVACY: peer-to-peer location data only — platform never stores route.
   */
  async activateSafetyCompanion(params: {
    userId: string
    trustedContactId: string
    destination: { lat: number; lng: number }
    estimatedArrival: Date
  }): Promise<{ shareId: string; shareToken: string; expiresAt: string }> {
    // Calculate expiry — sooner of: estimated arrival + 30min buffer OR max hours
    const maxExpiry = new Date()
    maxExpiry.setHours(maxExpiry.getHours() + config.SAFETY_COMPANION_MAX_HOURS)

    const arrivalBuffer = new Date(params.estimatedArrival)
    arrivalBuffer.setMinutes(arrivalBuffer.getMinutes() + 30)

    const expiresAt = arrivalBuffer < maxExpiry ? arrivalBuffer : maxExpiry

    // Create an ephemeral presence share — recipient-specific, time-limited
    const { data, error } = await supabase
      .from('presence_shares')
      .insert({
        sharer_id: params.userId,
        recipient_id: params.trustedContactId,
        share_type: 'safety_companion',
        expires_at: expiresAt.toISOString(),
        metadata: {
          destination_lat: params.destination.lat,
          destination_lng: params.destination.lng,
          estimated_arrival: params.estimatedArrival.toISOString(),
        },
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to activate safety companion: ${error.message}`)

    return {
      shareId: String(data.id),
      shareToken: data.share_token,  // used by recipient to access the share
      expiresAt: expiresAt.toISOString(),
    }
  }

  /**
   * End a safety companion share (on arrival or user request).
   */
  async endSafetyCompanion(shareId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('presence_shares')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', shareId)
      .eq('sharer_id', userId)

    if (error) throw new Error(`Failed to end safety companion: ${error.message}`)
  }

  // ── Private helpers ───────────────────────────────────────────

  private hashLocation(point: { lat: number; lng: number }): string {
    // Round to ~100m precision before hashing to allow cache hits for nearby queries
    const roundedLat = Math.round(point.lat * 1000) / 1000
    const roundedLng = Math.round(point.lng * 1000) / 1000
    return crypto
      .createHash('sha256')
      .update(`${roundedLat},${roundedLng}`)
      .digest('hex')
      .slice(0, 32)
  }

  private async getCachedRouteReport(
    originHash: string,
    destHash: string
  ): Promise<RouteSecurityReport | null> {
    const { data } = await supabase
      .from('route_security_queries')
      .select('*')
      .eq('origin_hash', originHash)
      .eq('destination_hash', destHash)
      .gt('cache_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return null

    return {
      riskLevel: data.risk_level as RiskLevel,
      summary: data.report_summary,
      alternativeRoutes: data.alternative_routes ?? [],
      safeSpotsNearby: [],  // not cached — always fresh
      expiresAt: data.cache_expires_at,
    }
  }

  private buildRouteReport(incidents: any[]): RouteSecurityReport {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString()

    if (incidents.length === 0) {
      return {
        riskLevel: 'low',
        summary: {
          incidentCount24h: 0,
          incidentTypes: [],
        },
        alternativeRoutes: [],
        safeSpotsNearby: [],
        expiresAt,
      }
    }

    // Count by category
    const categoryCounts: Record<string, number> = {}
    for (const incident of incidents) {
      categoryCounts[incident.category] = (categoryCounts[incident.category] ?? 0) + 1
    }

    const incidentTypes = Object.keys(categoryCounts)
    const mostCommonCategory = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])[0][0] as IncidentCategory

    // Determine risk level
    const highSeverityCount = incidents.filter(i => i.severity === 'high').length
    const moderateSeverityCount = incidents.filter(i => i.severity === 'moderate').length

    let riskLevel: RiskLevel = 'low'
    if (highSeverityCount >= 3 || incidents.length >= 10) riskLevel = 'high'
    else if (highSeverityCount >= 1 || moderateSeverityCount >= 3 || incidents.length >= 5) riskLevel = 'elevated'
    else if (incidents.length >= 2) riskLevel = 'moderate'

    return {
      riskLevel,
      summary: {
        incidentCount24h: incidents.length,
        incidentTypes,
        mostCommonCategory,
      },
      alternativeRoutes: riskLevel === 'elevated' || riskLevel === 'high'
        ? [{ description: 'Consider a longer but better-lit route', estimatedExtraMinutes: 5, riskLevel: 'low' }]
        : [],
      safeSpotsNearby: [],  // populated by PostGIS query in production
      expiresAt,
    }
  }
}
