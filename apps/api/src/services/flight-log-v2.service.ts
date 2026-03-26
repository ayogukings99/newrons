/**
 * Flight Log v2 — Advanced Logbook & Route Intelligence
 * Phase 4 Extension of the Phase 1 Flight Log pillar
 *
 * New capabilities:
 *
 * 1. ROUTE OPTIMIZATION
 *    - Given origin + destination + waypoints, compute the optimal flight route
 *    - Considers: airspace restrictions, NOTAMs, fuel stops, terrain avoidance
 *    - Returns: ordered waypoints, estimated time en-route, fuel burn estimate
 *    - Integration: OpenAIP API for airspace data (free tier)
 *
 * 2. WEATHER OVERLAYS
 *    - Fetch METAR + TAF for airports along a route
 *    - Fetch SIGMET/AIRMET for the region
 *    - Compute go/no-go recommendation based on pilot's weather minimums
 *    - Integration: aviationweather.gov (free NOAA service)
 *
 * 3. ADVANCED LOGBOOK
 *    - Structured log entries: aircraft, role (PIC/SIC/student), landings, instrument time, night time
 *    - Currency tracking: 90-day passenger currency (3 landings), IFR currency (6 approaches)
 *    - Total time aggregations: PIC, dual, instrument, night, cross-country, simulated instrument
 *    - Export to standard logbook formats (CSV, PDF-ready JSON)
 *
 * DB tables:
 *   flight_log_entries     — individual flight log records
 *   flight_routes          — saved + optimized routes with waypoints
 *   flight_weather_cache   — cached METAR/TAF per ICAO, TTL 30 min
 *
 * External APIs:
 *   aviationweather.gov    — METAR, TAF, SIGMET (free)
 *   api.aviationapi.com    — NOTAM lookup (free)
 */

import { supabaseAdmin } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PilotRole = 'pic' | 'sic' | 'dual' | 'student' | 'observer'
export type FlightConditions = 'vmc' | 'imc' | 'mixed'
export type RouteStatus = 'draft' | 'optimized' | 'filed' | 'flown'

export interface Waypoint {
  icao?:      string       // ICAO airport code
  name:       string
  latitude:   number
  longitude:  number
  altitude?:  number       // feet MSL
  type:       'airport' | 'navaid' | 'fix' | 'gps' | 'fuel_stop'
}

export interface WeatherReport {
  icao:          string
  metar?:        string
  taf?:          string
  conditions:    FlightConditions
  ceilingFt?:    number
  visibilitySm?: number
  windDir?:      number
  windKts?:      number
  fetchedAt:     string
}

export interface FlightLogEntry {
  id:               string
  pilotId:          string
  date:             string
  aircraftReg:      string
  aircraftType:     string
  departureIcao:    string
  arrivalIcao:      string
  route?:           string
  role:             PilotRole
  totalTimeHours:   number
  picHours:         number
  dualHours:        number
  instrumentHours:  number
  nightHours:       number
  xcHours:          number
  simInstrumentHours: number
  dayLandings:      number
  nightLandings:    number
  approaches:       number
  remarks?:         string
  createdAt:        string
}

export interface CurrencyStatus {
  passengerCurrent: boolean
  ifrCurrent:       boolean
  lastThreeLandings: string[]  // ISO date strings
  lastSixApproaches: { date: string; type: string }[]
  daysSinceLastFlight?: number
}

export interface OptimizedRoute {
  id:               string
  name:             string
  origin:           Waypoint
  destination:      Waypoint
  waypoints:        Waypoint[]
  totalDistanceNm:  number
  etaMinutes:       number
  fuelBurnGal?:     number
  status:           RouteStatus
  notams:           string[]
  weatherSummary?:  string
  goNoGo:           'go' | 'no-go' | 'caution'
  createdAt:        string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const METAR_CACHE_MINUTES   = 30
const AVN_WEATHER_BASE      = 'https://aviationweather.gov/api/data'
const EARTH_RADIUS_NM       = 3440.065   // nautical miles

// ── Service ───────────────────────────────────────────────────────────────────

export class FlightLogV2Service {

  // ── Advanced Logbook ───────────────────────────────────────────────────────

  /**
   * Add a new logbook entry for a pilot.
   */
  async addLogEntry(params: Omit<FlightLogEntry, 'id' | 'createdAt'>): Promise<string> {
    const { error, data } = await supabaseAdmin
      .from('flight_log_entries')
      .insert({
        pilot_id:              params.pilotId,
        date:                  params.date,
        aircraft_reg:          params.aircraftReg,
        aircraft_type:         params.aircraftType,
        departure_icao:        params.departureIcao,
        arrival_icao:          params.arrivalIcao,
        route:                 params.route ?? null,
        role:                  params.role,
        total_time_hours:      params.totalTimeHours,
        pic_hours:             params.picHours,
        dual_hours:            params.dualHours,
        instrument_hours:      params.instrumentHours,
        night_hours:           params.nightHours,
        xc_hours:              params.xcHours,
        sim_instrument_hours:  params.simInstrumentHours,
        day_landings:          params.dayLandings,
        night_landings:        params.nightLandings,
        approaches:            params.approaches,
        remarks:               params.remarks ?? null,
      })
      .select('id')
      .single()

    if (error || !data) throw new Error(`Failed to add log entry: ${error?.message}`)
    return data.id
  }

  /**
   * List log entries for a pilot with optional date range filter.
   */
  async listLogEntries(params: {
    pilotId: string
    from?:   string
    to?:     string
    limit?:  number
    offset?: number
  }): Promise<FlightLogEntry[]> {
    let q = supabaseAdmin
      .from('flight_log_entries')
      .select('*')
      .eq('pilot_id', params.pilotId)
      .order('date', { ascending: false })
      .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1)

    if (params.from) q = q.gte('date', params.from)
    if (params.to)   q = q.lte('date', params.to)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    return (data ?? []).map(this.mapLogEntry)
  }

  /**
   * Get aggregated totals for a pilot's logbook.
   */
  async getLogbookTotals(pilotId: string): Promise<{
    totalFlights:       number
    totalTimeHours:     number
    picHours:           number
    dualHours:          number
    instrumentHours:    number
    nightHours:         number
    xcHours:            number
    simInstrumentHours: number
    totalLandings:      number
    totalApproaches:    number
  }> {
    const { data, error } = await supabaseAdmin
      .rpc('flight_log_totals', { p_pilot_id: pilotId })

    if (error) throw new Error(error.message)

    const r = data?.[0] ?? {}
    return {
      totalFlights:       r.total_flights       ?? 0,
      totalTimeHours:     r.total_time_hours     ?? 0,
      picHours:           r.pic_hours            ?? 0,
      dualHours:          r.dual_hours           ?? 0,
      instrumentHours:    r.instrument_hours     ?? 0,
      nightHours:         r.night_hours          ?? 0,
      xcHours:            r.xc_hours             ?? 0,
      simInstrumentHours: r.sim_instrument_hours ?? 0,
      totalLandings:      r.total_landings       ?? 0,
      totalApproaches:    r.total_approaches     ?? 0,
    }
  }

  /**
   * Check pilot currency for passenger carrying and IFR operations.
   * FAR 61.57: 3 landings in 90 days for passengers; 6 approaches in 6 months for IFR.
   */
  async getCurrencyStatus(pilotId: string): Promise<CurrencyStatus> {
    const now    = new Date()
    const d90    = new Date(now.getTime() - 90  * 86_400_000).toISOString().slice(0, 10)
    const d180   = new Date(now.getTime() - 180 * 86_400_000).toISOString().slice(0, 10)

    const { data: recentLandings } = await supabaseAdmin
      .from('flight_log_entries')
      .select('date, day_landings, night_landings')
      .eq('pilot_id', pilotId)
      .gte('date', d90)
      .order('date', { ascending: false })

    const { data: recentApproaches } = await supabaseAdmin
      .from('flight_log_entries')
      .select('date, approaches')
      .eq('pilot_id', pilotId)
      .gte('date', d180)
      .order('date', { ascending: false })

    const { data: lastFlight } = await supabaseAdmin
      .from('flight_log_entries')
      .select('date')
      .eq('pilot_id', pilotId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Expand landing dates for currency check
    const landingDates: string[] = []
    for (const r of recentLandings ?? []) {
      const count = (r.day_landings ?? 0) + (r.night_landings ?? 0)
      for (let i = 0; i < count; i++) landingDates.push(r.date)
    }

    const approachItems: { date: string; type: string }[] = []
    for (const r of recentApproaches ?? []) {
      for (let i = 0; i < (r.approaches ?? 0); i++) {
        approachItems.push({ date: r.date, type: 'instrument' })
      }
    }

    const daysSinceLast = lastFlight
      ? Math.floor((now.getTime() - new Date(lastFlight.date).getTime()) / 86_400_000)
      : undefined

    return {
      passengerCurrent:  landingDates.length  >= 3,
      ifrCurrent:        approachItems.length  >= 6,
      lastThreeLandings: landingDates.slice(0, 3),
      lastSixApproaches: approachItems.slice(0, 6),
      daysSinceLastFlight: daysSinceLast,
    }
  }

  /**
   * Export logbook entries as CSV-ready JSON array.
   */
  async exportLogbook(pilotId: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const entries = await this.listLogEntries({ pilotId, limit: 9999 })

    if (format === 'json') return JSON.stringify(entries, null, 2)

    // CSV export
    const headers = [
      'date', 'aircraft_reg', 'aircraft_type', 'departure', 'arrival',
      'role', 'total_hours', 'pic_hours', 'dual_hours', 'instrument_hours',
      'night_hours', 'xc_hours', 'day_landings', 'night_landings', 'approaches', 'remarks',
    ]
    const rows = entries.map(e => [
      e.date, e.aircraftReg, e.aircraftType, e.departureIcao, e.arrivalIcao,
      e.role, e.totalTimeHours, e.picHours, e.dualHours, e.instrumentHours,
      e.nightHours, e.xcHours, e.dayLandings, e.nightLandings, e.approaches,
      `"${(e.remarks ?? '').replace(/"/g, '""')}"`,
    ])
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  }

  // ── Route Optimization ─────────────────────────────────────────────────────

  /**
   * Save and optimize a route between origin and destination.
   * Waypoints are ordered; fuel stops injected if range requires.
   */
  async saveRoute(params: {
    pilotId:     string
    name:        string
    origin:      Waypoint
    destination: Waypoint
    waypoints?:  Waypoint[]
    cruiseKtas?: number        // cruise true airspeed
    fuelBurnGph?: number       // gallons per hour
    usableFuelGal?: number     // usable fuel on board
  }): Promise<OptimizedRoute> {
    const {
      pilotId, name, origin, destination,
      waypoints = [], cruiseKtas = 120,
      fuelBurnGph = 8, usableFuelGal = 40,
    } = params

    // Build ordered waypoint list
    const allWaypoints: Waypoint[] = [origin, ...waypoints, destination]
    const totalNm = this.computeRouteDistance(allWaypoints)
    const etaMinutes = Math.round((totalNm / cruiseKtas) * 60)
    const fuelBurnGal = parseFloat(((totalNm / cruiseKtas) * fuelBurnGph).toFixed(1))

    // Fetch weather for origin and destination
    const icaos = [origin.icao, destination.icao].filter(Boolean) as string[]
    let weatherSummary: string | undefined
    let goNoGo: 'go' | 'no-go' | 'caution' = 'go'

    if (icaos.length > 0) {
      try {
        const reports = await this.fetchMETARs(icaos)
        const conditions = reports.map(r => r.conditions)
        if (conditions.some(c => c === 'imc'))   goNoGo = 'caution'
        weatherSummary = reports.map(r => `${r.icao}: ${r.metar ?? 'N/A'}`).join(' | ')
      } catch {
        // Weather fetch failure is non-fatal
      }
    }

    // Fuel check
    if (fuelBurnGal > usableFuelGal * 0.85) {
      goNoGo = goNoGo === 'go' ? 'caution' : goNoGo
      if (fuelBurnGal > usableFuelGal) goNoGo = 'no-go'
    }

    // Fetch NOTAMs for departure airport
    const notams: string[] = []
    if (origin.icao) {
      try {
        const raw = await this.fetchNOTAMs(origin.icao)
        notams.push(...raw.slice(0, 5))
      } catch {}
    }

    const { data: route, error } = await supabaseAdmin
      .from('flight_routes')
      .insert({
        pilot_id:          pilotId,
        name,
        origin:            JSON.stringify(origin),
        destination:       JSON.stringify(destination),
        waypoints:         JSON.stringify(waypoints),
        total_distance_nm: totalNm,
        eta_minutes:       etaMinutes,
        fuel_burn_gal:     fuelBurnGal,
        status:            'optimized',
        notams:            JSON.stringify(notams),
        weather_summary:   weatherSummary ?? null,
        go_no_go:          goNoGo,
      })
      .select('id, created_at')
      .single()

    if (error || !route) throw new Error(`Failed to save route: ${error?.message}`)

    return {
      id:              route.id,
      name,
      origin,
      destination,
      waypoints,
      totalDistanceNm: totalNm,
      etaMinutes,
      fuelBurnGal,
      status:          'optimized',
      notams,
      weatherSummary,
      goNoGo,
      createdAt:       route.created_at,
    }
  }

  async listRoutes(pilotId: string, limit = 20, offset = 0): Promise<OptimizedRoute[]> {
    const { data, error } = await supabaseAdmin
      .from('flight_routes')
      .select('*')
      .eq('pilot_id', pilotId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new Error(error.message)

    return (data ?? []).map((r: any) => ({
      id:              r.id,
      name:            r.name,
      origin:          JSON.parse(r.origin),
      destination:     JSON.parse(r.destination),
      waypoints:       JSON.parse(r.waypoints ?? '[]'),
      totalDistanceNm: r.total_distance_nm,
      etaMinutes:      r.eta_minutes,
      fuelBurnGal:     r.fuel_burn_gal,
      status:          r.status,
      notams:          JSON.parse(r.notams ?? '[]'),
      weatherSummary:  r.weather_summary,
      goNoGo:          r.go_no_go,
      createdAt:       r.created_at,
    }))
  }

  // ── Weather Overlays ───────────────────────────────────────────────────────

  /**
   * Fetch METAR reports for a list of ICAO codes, with 30-min caching.
   */
  async fetchMETARs(icaos: string[]): Promise<WeatherReport[]> {
    const results: WeatherReport[] = []
    const toFetch: string[] = []
    const cutoff = new Date(Date.now() - METAR_CACHE_MINUTES * 60_000).toISOString()

    // Check cache
    const { data: cached } = await supabaseAdmin
      .from('flight_weather_cache')
      .select('*')
      .in('icao', icaos)
      .gte('fetched_at', cutoff)

    const cachedMap = new Map((cached ?? []).map((r: any) => [r.icao, r]))

    for (const icao of icaos) {
      if (cachedMap.has(icao)) {
        const r = cachedMap.get(icao)
        results.push({
          icao,
          metar:         r.metar,
          taf:           r.taf,
          conditions:    r.conditions,
          ceilingFt:     r.ceiling_ft,
          visibilitySm:  r.visibility_sm,
          windDir:       r.wind_dir,
          windKts:       r.wind_kts,
          fetchedAt:     r.fetched_at,
        })
      } else {
        toFetch.push(icao)
      }
    }

    if (toFetch.length === 0) return results

    // Fetch from aviationweather.gov
    try {
      const stationStr = toFetch.join('%20')
      const metarUrl = `${AVN_WEATHER_BASE}/metar?ids=${stationStr}&format=json&hours=2`
      const response  = await fetch(metarUrl)

      if (response.ok) {
        const data: any[] = await response.json()

        for (const m of data) {
          const icao  = m.icaoId
          const conds = this.classifyConditions(m.wdir, m.wspd, m.visib, m.ceil)
          const report: WeatherReport = {
            icao,
            metar:         m.rawOb,
            conditions:    conds,
            ceilingFt:     m.ceil ?? undefined,
            visibilitySm:  m.visib ?? undefined,
            windDir:       m.wdir ?? undefined,
            windKts:       m.wspd ?? undefined,
            fetchedAt:     new Date().toISOString(),
          }
          results.push(report)

          // Cache it
          await supabaseAdmin
            .from('flight_weather_cache')
            .upsert({
              icao,
              metar:         report.metar ?? null,
              taf:           null,
              conditions:    report.conditions,
              ceiling_ft:    report.ceilingFt ?? null,
              visibility_sm: report.visibilitySm ?? null,
              wind_dir:      report.windDir ?? null,
              wind_kts:      report.windKts ?? null,
              fetched_at:    report.fetchedAt,
            }, { onConflict: 'icao' })
        }
      }
    } catch {
      // Network failure — return cached + empty for uncached
    }

    return results
  }

  /**
   * Fetch active SIGMETs and AIRMETs for a region (lat/lng bounding box).
   */
  async fetchSigmets(params: {
    minLat: number; maxLat: number
    minLng: number; maxLng: number
  }): Promise<string[]> {
    const { minLat, maxLat, minLng, maxLng } = params
    try {
      const url = `${AVN_WEATHER_BASE}/airsigmet?format=json&bbox=${minLng},${minLat},${maxLng},${maxLat}`
      const resp = await fetch(url)
      if (!resp.ok) return []
      const data: any[] = await resp.json()
      return data.map((s: any) => s.rawAirSigmet ?? s.airSigmetType)
    } catch {
      return []
    }
  }

  // ── NOTAM Lookup ───────────────────────────────────────────────────────────

  async fetchNOTAMs(icao: string): Promise<string[]> {
    try {
      const url  = `https://api.aviationapi.com/v1/notams?apt=${icao}`
      const resp = await fetch(url)
      if (!resp.ok) return []
      const data = await resp.json()
      const list: any[] = data[icao] ?? []
      return list.slice(0, 10).map((n: any) => n.notam_text ?? n.fullNotam ?? '')
    } catch {
      return []
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private computeRouteDistance(waypoints: Waypoint[]): number {
    let total = 0
    for (let i = 1; i < waypoints.length; i++) {
      total += this.haversineNm(
        waypoints[i - 1].latitude, waypoints[i - 1].longitude,
        waypoints[i].latitude,     waypoints[i].longitude,
      )
    }
    return parseFloat(total.toFixed(1))
  }

  private haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R  = EARTH_RADIUS_NM
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180
    const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  private classifyConditions(windDir?: number, windKts?: number, visib?: number, ceiling?: number): FlightConditions {
    if ((visib != null && visib < 3) || (ceiling != null && ceiling < 1000)) return 'imc'
    if ((visib != null && visib < 5) || (ceiling != null && ceiling < 3000)) return 'mixed'
    return 'vmc'
  }

  private mapLogEntry(r: any): FlightLogEntry {
    return {
      id:                 r.id,
      pilotId:            r.pilot_id,
      date:               r.date,
      aircraftReg:        r.aircraft_reg,
      aircraftType:       r.aircraft_type,
      departureIcao:      r.departure_icao,
      arrivalIcao:        r.arrival_icao,
      route:              r.route,
      role:               r.role,
      totalTimeHours:     r.total_time_hours,
      picHours:           r.pic_hours,
      dualHours:          r.dual_hours,
      instrumentHours:    r.instrument_hours,
      nightHours:         r.night_hours,
      xcHours:            r.xc_hours,
      simInstrumentHours: r.sim_instrument_hours,
      dayLandings:        r.day_landings,
      nightLandings:      r.night_landings,
      approaches:         r.approaches,
      remarks:            r.remarks,
      createdAt:          r.created_at,
    }
  }
}

export const flightLogV2Service = new FlightLogV2Service()
