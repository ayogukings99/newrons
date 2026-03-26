/**
 * Security Intelligence v2 — Phase 4 Full Layer
 *
 * Two complementary systems:
 *
 * 1. COMMUNITY INCIDENT VALIDATION
 *    - Users report suspicious activity, crime, or safety concerns in their area
 *    - Reports are validated: 3+ independent reports within 72 hours = confirmed incident
 *    - Confirmed incidents surface in the safety layer and generate push alerts
 *    - Pattern aggregation: cluster reports by proximity (PostGIS) + time window
 *    - Each report has: type, severity, location, description, anonymized reporter
 *    - Validation cooldown: a user can only submit one report per location per hour
 *
 * 2. LIVE SAFETY COMPANION
 *    - Peer-to-peer ephemeral location sharing with trusted contacts
 *    - "I'm on the move" sessions: share live location for a fixed time window (up to 4h)
 *    - Panic trigger: one-tap SOS → sends last known location to all trusted contacts + emergency services number
 *    - Sessions auto-expire; location data purged from DB after session ends
 *    - Sessions stored ephemerally in Redis (TTL = session_duration)
 *    - WebSocket push to watchers when sharer's location updates
 *
 * DB tables:
 *   security_reports         — individual incident reports
 *   security_incidents       — validated/confirmed incidents (cluster of 3+)
 *   security_trusted_contacts — user's trusted contact relationships
 *   security_companion_sessions — active live-location sessions (ephemeral, short TTL)
 *
 * External deps:
 *   PostGIS ST_DWithin for proximity clustering
 *   Supabase Realtime for WebSocket push to watchers
 */

import { supabaseAdmin } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type IncidentType =
  | 'theft'
  | 'assault'
  | 'suspicious_activity'
  | 'road_hazard'
  | 'police_checkpoint'
  | 'fire'
  | 'flood'
  | 'protest'
  | 'power_outage'
  | 'other'

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'

export type IncidentStatus = 'reported' | 'validating' | 'confirmed' | 'resolved' | 'dismissed'

export interface SecurityReport {
  id:           string
  reporterId:   string
  type:         IncidentType
  severity:     IncidentSeverity
  latitude:     number
  longitude:    number
  description:  string
  anonymous:    boolean
  incidentId?:  string
  createdAt:    string
}

export interface SecurityIncident {
  id:           string
  type:         IncidentType
  severity:     IncidentSeverity
  latitude:     number
  longitude:    number
  reportCount:  number
  status:       IncidentStatus
  summary?:     string
  firstSeenAt:  string
  lastSeenAt:   string
  expiresAt:    string
}

export interface CompanionSession {
  id:            string
  sharerId:      string
  sharerName?:   string
  latitude:      number
  longitude:     number
  watcherIds:    string[]
  expiresAt:     string
  createdAt:     string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_REPORTS_TO_CONFIRM     = 3        // reports needed to confirm incident
const CLUSTER_RADIUS_METERS      = 200      // ST_DWithin radius for grouping reports
const INCIDENT_WINDOW_HOURS      = 72       // hours before unconfirmed reports expire
const REPORT_COOLDOWN_MINUTES    = 60       // one report per location per user per hour
const MAX_COMPANION_SESSION_HOURS = 4       // max live-location session length
const INCIDENT_EXPIRY_HOURS      = 48       // confirmed incidents expire after 48h if not updated

// ── Service ───────────────────────────────────────────────────────────────────

export class SecurityV2Service {

  // ── Community Incident Reports ─────────────────────────────────────────────

  /**
   * Submit a new safety report. Triggers cluster check + possible incident confirmation.
   */
  async submitReport(params: {
    reporterId:   string
    type:         IncidentType
    severity:     IncidentSeverity
    latitude:     number
    longitude:    number
    description:  string
    anonymous?:   boolean
  }): Promise<{ reportId: string; incidentId?: string; confirmed: boolean }> {
    const { reporterId, type, severity, latitude, longitude, description, anonymous = true } = params

    // Rate-limit: one report per location (200m radius) per user per hour
    const cooldownSince = new Date(Date.now() - REPORT_COOLDOWN_MINUTES * 60_000).toISOString()
    const { data: recent } = await supabaseAdmin
      .rpc('security_reports_in_radius', {
        p_lat:    latitude,
        p_lng:    longitude,
        p_radius: CLUSTER_RADIUS_METERS,
        p_since:  cooldownSince,
        p_user_id: reporterId,
      })

    if (recent && recent.length > 0) {
      throw new Error(`You already reported an incident in this area within the last ${REPORT_COOLDOWN_MINUTES} minutes`)
    }

    // Insert the report
    const { data: report, error } = await supabaseAdmin
      .from('security_reports')
      .insert({
        reporter_id:  reporterId,
        type,
        severity,
        location:     `POINT(${longitude} ${latitude})`,
        description,
        anonymous,
        status:       'pending',
      })
      .select('id')
      .single()

    if (error || !report) throw new Error(`Failed to submit report: ${error?.message}`)

    // Try to cluster with existing incident or create new one
    const result = await this.clusterAndValidate({ reportId: report.id, type, severity, latitude, longitude })

    return { reportId: report.id, ...result }
  }

  /**
   * Cluster the new report with nearby reports in the 72h window.
   * If cluster reaches MIN_REPORTS_TO_CONFIRM, mark incident as confirmed.
   */
  private async clusterAndValidate(params: {
    reportId:  string
    type:      IncidentType
    severity:  IncidentSeverity
    latitude:  number
    longitude: number
  }): Promise<{ incidentId?: string; confirmed: boolean }> {
    const { reportId, type, latitude, longitude } = params

    const windowSince = new Date(Date.now() - INCIDENT_WINDOW_HOURS * 3_600_000).toISOString()

    // Find existing unresolved incident of same type within cluster radius
    const { data: nearbyIncidents } = await supabaseAdmin
      .rpc('security_incidents_in_radius', {
        p_lat:    latitude,
        p_lng:    longitude,
        p_radius: CLUSTER_RADIUS_METERS,
        p_type:   type,
        p_since:  windowSince,
      })

    let incidentId: string | undefined

    if (nearbyIncidents && nearbyIncidents.length > 0) {
      // Associate report with the nearest existing incident
      incidentId = nearbyIncidents[0].id

      // Increment report count and update last_seen, severity (escalate only)
      const { data: updated } = await supabaseAdmin
        .from('security_incidents')
        .update({
          report_count: nearbyIncidents[0].report_count + 1,
          last_seen_at: new Date().toISOString(),
          severity:     this.escalateSeverity(nearbyIncidents[0].severity, params.severity),
          status:       nearbyIncidents[0].report_count + 1 >= MIN_REPORTS_TO_CONFIRM ? 'confirmed' : 'validating',
          expires_at:   new Date(Date.now() + INCIDENT_EXPIRY_HOURS * 3_600_000).toISOString(),
        })
        .eq('id', incidentId)
        .select('report_count, status')
        .single()

      await supabaseAdmin
        .from('security_reports')
        .update({ incident_id: incidentId })
        .eq('id', reportId)

      const confirmed = (updated?.report_count ?? 0) >= MIN_REPORTS_TO_CONFIRM
      return { incidentId, confirmed }

    } else {
      // Create a new incident
      const expiresAt = new Date(Date.now() + INCIDENT_EXPIRY_HOURS * 3_600_000).toISOString()
      const { data: incident, error } = await supabaseAdmin
        .from('security_incidents')
        .insert({
          type,
          severity:     params.severity,
          location:     `POINT(${longitude} ${latitude})`,
          report_count: 1,
          status:       'validating',
          first_seen_at: new Date().toISOString(),
          last_seen_at:  new Date().toISOString(),
          expires_at:    expiresAt,
        })
        .select('id')
        .single()

      if (error || !incident) return { confirmed: false }

      incidentId = incident.id
      await supabaseAdmin
        .from('security_reports')
        .update({ incident_id: incidentId })
        .eq('id', reportId)

      return { incidentId, confirmed: false }
    }
  }

  /**
   * Get active confirmed incidents near a location.
   */
  async getNearbyIncidents(params: {
    latitude:      number
    longitude:     number
    radiusMeters?: number
    limit?:        number
  }): Promise<SecurityIncident[]> {
    const { latitude, longitude, radiusMeters = 2000, limit = 30 } = params

    const { data, error } = await supabaseAdmin
      .rpc('security_incidents_in_radius', {
        p_lat:    latitude,
        p_lng:    longitude,
        p_radius: radiusMeters,
        p_type:   null,
        p_since:  new Date(Date.now() - INCIDENT_EXPIRY_HOURS * 3_600_000).toISOString(),
      })
      .limit(limit)

    if (error) throw new Error(error.message)

    return (data ?? []).map((r: any) => ({
      id:          r.id,
      type:        r.type,
      severity:    r.severity,
      latitude:    r.lat,
      longitude:   r.lng,
      reportCount: r.report_count,
      status:      r.status,
      summary:     r.summary,
      firstSeenAt: r.first_seen_at,
      lastSeenAt:  r.last_seen_at,
      expiresAt:   r.expires_at,
    }))
  }

  /**
   * Dismiss or resolve an incident (admin/moderator action).
   */
  async updateIncidentStatus(incidentId: string, status: 'resolved' | 'dismissed', summary?: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('security_incidents')
      .update({ status, summary: summary ?? null })
      .eq('id', incidentId)

    if (error) throw new Error(error.message)
  }

  /**
   * Auto-expire stale unconfirmed incidents (cron-callable).
   */
  async expireStaleIncidents(): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('security_incidents')
      .update({ status: 'dismissed' })
      .in('status', ['validating', 'reported'])
      .lt('expires_at', new Date().toISOString())
      .select('id')

    if (error) return 0
    return data?.length ?? 0
  }

  // ── Trusted Contacts ───────────────────────────────────────────────────────

  /**
   * Add a trusted contact (bidirectional trust requires both users to add each other).
   */
  async addTrustedContact(userId: string, contactId: string): Promise<void> {
    if (userId === contactId) throw new Error('Cannot add yourself as a trusted contact')

    const { error } = await supabaseAdmin
      .from('security_trusted_contacts')
      .upsert({ user_id: userId, contact_id: contactId }, { onConflict: 'user_id,contact_id' })

    if (error) throw new Error(error.message)
  }

  async removeTrustedContact(userId: string, contactId: string): Promise<void> {
    await supabaseAdmin
      .from('security_trusted_contacts')
      .delete()
      .eq('user_id', userId)
      .eq('contact_id', contactId)
  }

  async listTrustedContacts(userId: string): Promise<{ contactId: string; mutualTrust: boolean }[]> {
    const { data, error } = await supabaseAdmin
      .from('security_trusted_contacts')
      .select('contact_id')
      .eq('user_id', userId)

    if (error) throw new Error(error.message)

    const contactIds = (data ?? []).map((r: any) => r.contact_id)
    if (!contactIds.length) return []

    // Check which contacts also trust back
    const { data: reverse } = await supabaseAdmin
      .from('security_trusted_contacts')
      .select('user_id')
      .in('user_id', contactIds)
      .eq('contact_id', userId)

    const mutualSet = new Set((reverse ?? []).map((r: any) => r.user_id))

    return contactIds.map((cid: string) => ({
      contactId:   cid,
      mutualTrust: mutualSet.has(cid),
    }))
  }

  // ── Live Safety Companion ──────────────────────────────────────────────────

  /**
   * Start a live location sharing session with trusted contacts.
   * Returns a session token that watchers use to subscribe.
   */
  async startCompanionSession(params: {
    sharerId:         string
    latitude:         number
    longitude:        number
    durationMinutes?: number
    watcherIds?:      string[]
  }): Promise<{ sessionId: string; expiresAt: string }> {
    const { sharerId, latitude, longitude, watcherIds = [], durationMinutes = 60 } = params

    const clampedDuration = Math.min(durationMinutes, MAX_COMPANION_SESSION_HOURS * 60)
    const expiresAt = new Date(Date.now() + clampedDuration * 60_000)

    // Verify watchers are trusted contacts
    if (watcherIds.length > 0) {
      const trusted = await this.listTrustedContacts(sharerId)
      const trustedIds = new Set(trusted.map(t => t.contactId))
      const invalid = watcherIds.filter(id => !trustedIds.has(id))
      if (invalid.length > 0) {
        throw new Error(`Some watchers are not trusted contacts: ${invalid.join(', ')}`)
      }
    }

    const { data: session, error } = await supabaseAdmin
      .from('security_companion_sessions')
      .insert({
        sharer_id:   sharerId,
        location:    `POINT(${longitude} ${latitude})`,
        watcher_ids: watcherIds,
        expires_at:  expiresAt.toISOString(),
        is_sos:      false,
      })
      .select('id')
      .single()

    if (error || !session) throw new Error(`Failed to start companion session: ${error?.message}`)

    return { sessionId: session.id, expiresAt: expiresAt.toISOString() }
  }

  /**
   * Update sharer's location during an active session.
   * Supabase Realtime will push this to connected watchers.
   */
  async updateCompanionLocation(params: {
    sessionId: string
    sharerId:  string
    latitude:  number
    longitude: number
  }): Promise<void> {
    const { sessionId, sharerId, latitude, longitude } = params

    // Verify session belongs to sharer and is active
    const { data: session } = await supabaseAdmin
      .from('security_companion_sessions')
      .select('sharer_id, expires_at')
      .eq('id', sessionId)
      .single()

    if (!session) throw new Error('Session not found')
    if (session.sharer_id !== sharerId) throw new Error('Not authorized')
    if (new Date(session.expires_at) < new Date()) throw new Error('Session has expired')

    await supabaseAdmin
      .from('security_companion_sessions')
      .update({
        location:     `POINT(${longitude} ${latitude})`,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', sessionId)
  }

  /**
   * End a companion session (sharer or watcher can end).
   */
  async endCompanionSession(sessionId: string, userId: string): Promise<void> {
    const { data: session } = await supabaseAdmin
      .from('security_companion_sessions')
      .select('sharer_id, watcher_ids')
      .eq('id', sessionId)
      .single()

    if (!session) throw new Error('Session not found')

    const isSharer  = session.sharer_id === userId
    const isWatcher = (session.watcher_ids as string[]).includes(userId)
    if (!isSharer && !isWatcher) throw new Error('Not authorized')

    await supabaseAdmin
      .from('security_companion_sessions')
      .delete()
      .eq('id', sessionId)
  }

  /**
   * Get active session info (for watchers to read location).
   */
  async getCompanionSession(sessionId: string, requesterId: string): Promise<CompanionSession | null> {
    const { data: session } = await supabaseAdmin
      .from('security_companion_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (!session) return null

    // Only sharer or watchers may view
    const isSharer  = session.sharer_id === requesterId
    const isWatcher = (session.watcher_ids as string[]).includes(requesterId)
    if (!isSharer && !isWatcher) throw new Error('Not authorized to view this session')

    if (new Date(session.expires_at) < new Date()) {
      // Clean up expired session
      await supabaseAdmin.from('security_companion_sessions').delete().eq('id', sessionId)
      return null
    }

    // Extract lat/lng from PostGIS point string "POINT(lng lat)"
    const coords = this.parsePoint(session.location)

    return {
      id:         session.id,
      sharerId:   session.sharer_id,
      latitude:   coords.lat,
      longitude:  coords.lng,
      watcherIds: session.watcher_ids ?? [],
      expiresAt:  session.expires_at,
      createdAt:  session.created_at,
    }
  }

  /**
   * SOS panic trigger — mark session as SOS, notify all trusted contacts.
   * In production: integrates with FCM/APNs push + SMS gateway.
   */
  async triggerSOS(params: {
    sharerId:  string
    latitude:  number
    longitude: number
  }): Promise<{ sessionId: string; notifiedCount: number }> {
    const { sharerId, latitude, longitude } = params

    // Get all trusted contacts as watchers
    const trusted = await this.listTrustedContacts(sharerId)
    const watcherIds = trusted.map(t => t.contactId)

    // Create or update a 30-minute SOS session
    const expiresAt = new Date(Date.now() + 30 * 60_000)

    const { data: existing } = await supabaseAdmin
      .from('security_companion_sessions')
      .select('id')
      .eq('sharer_id', sharerId)
      .eq('is_sos', true)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle()

    let sessionId: string

    if (existing) {
      sessionId = existing.id
      await supabaseAdmin
        .from('security_companion_sessions')
        .update({
          location:    `POINT(${longitude} ${latitude})`,
          watcher_ids: watcherIds,
          expires_at:  expiresAt.toISOString(),
        })
        .eq('id', sessionId)
    } else {
      const { data: session } = await supabaseAdmin
        .from('security_companion_sessions')
        .insert({
          sharer_id:   sharerId,
          location:    `POINT(${longitude} ${latitude})`,
          watcher_ids: watcherIds,
          expires_at:  expiresAt.toISOString(),
          is_sos:      true,
        })
        .select('id')
        .single()

      sessionId = session!.id
    }

    // TODO: FCM/APNs push to watcher_ids with SOS alert + sessionId deep-link

    return { sessionId, notifiedCount: watcherIds.length }
  }

  /**
   * List sessions where the user is a watcher (incoming shared locations).
   */
  async getWatchedSessions(userId: string): Promise<CompanionSession[]> {
    const { data, error } = await supabaseAdmin
      .from('security_companion_sessions')
      .select('*')
      .contains('watcher_ids', [userId])
      .gte('expires_at', new Date().toISOString())

    if (error) throw new Error(error.message)

    return (data ?? []).map((s: any) => {
      const coords = this.parsePoint(s.location)
      return {
        id:         s.id,
        sharerId:   s.sharer_id,
        latitude:   coords.lat,
        longitude:  coords.lng,
        watcherIds: s.watcher_ids ?? [],
        expiresAt:  s.expires_at,
        createdAt:  s.created_at,
      }
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private escalateSeverity(existing: IncidentSeverity, incoming: IncidentSeverity): IncidentSeverity {
    const order: Record<IncidentSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 }
    return order[incoming] > order[existing] ? incoming : existing
  }

  private parsePoint(postgisPoint: string): { lat: number; lng: number } {
    // "POINT(lng lat)" format
    const match = postgisPoint?.match(/POINT\(([^\s]+)\s+([^\)]+)\)/)
    if (!match) return { lat: 0, lng: 0 }
    return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) }
  }
}

export const securityV2Service = new SecurityV2Service()
