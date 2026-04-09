/**
 * Flight Log v2 Routes — Phase 4 Advanced Logbook
 * Mount at: /flights/v2
 *
 * Logbook:
 *   POST   /log                   — add a logbook entry
 *   GET    /log                   — list logbook entries (with date range filter)
 *   GET    /log/totals            — aggregated logbook totals
 *   GET    /log/currency          — pilot currency status (passenger + IFR)
 *   GET    /log/export            — export logbook as CSV or JSON
 *
 * Routes:
 *   POST   /routes                — save and optimize a new route
 *   GET    /routes                — list saved routes
 *
 * Weather:
 *   GET    /weather/metar         — fetch METARs for ICAO list
 *   GET    /weather/sigmets       — fetch SIGMETs/AIRMETs for bounding box
 *
 * NOTAMs:
 *   GET    /notams/:icao          — fetch NOTAMs for an airport
 */

import { FastifyInstance } from 'fastify'
import { flightLogV2Service, PilotRole } from '../services/flight-log-v2.service'
import { requireAuth } from '../middleware/auth'

export async function flightLogV2Routes(app: FastifyInstance) {

  // ── Logbook CRUD ───────────────────────────────────────────────────────────

  /**
   * POST /log
   * Add a new logbook entry.
   */
  app.post('/log', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const body = req.body as {
      date:               string
      aircraftReg:        string
      aircraftType:       string
      departureIcao:      string
      arrivalIcao:        string
      route?:             string
      role:               PilotRole
      totalTimeHours:     number
      picHours?:          number
      dualHours?:         number
      instrumentHours?:   number
      nightHours?:        number
      xcHours?:           number
      simInstrumentHours?: number
      dayLandings?:       number
      nightLandings?:     number
      approaches?:        number
      remarks?:           string
    }

    if (!body.date)          return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' })
    if (!body.aircraftReg)   return reply.code(400).send({ error: 'aircraftReg required' })
    if (!body.aircraftType)  return reply.code(400).send({ error: 'aircraftType required' })
    if (!body.departureIcao) return reply.code(400).send({ error: 'departureIcao required' })
    if (!body.arrivalIcao)   return reply.code(400).send({ error: 'arrivalIcao required' })
    if (!body.role)          return reply.code(400).send({ error: 'role required' })
    if (body.totalTimeHours == null) return reply.code(400).send({ error: 'totalTimeHours required' })

    try {
      const entryId = await flightLogV2Service.addLogEntry({
        pilotId:            userId,
        date:               body.date,
        aircraftReg:        body.aircraftReg,
        aircraftType:       body.aircraftType,
        departureIcao:      body.departureIcao,
        arrivalIcao:        body.arrivalIcao,
        route:              body.route,
        role:               body.role,
        totalTimeHours:     body.totalTimeHours,
        picHours:           body.picHours          ?? 0,
        dualHours:          body.dualHours         ?? 0,
        instrumentHours:    body.instrumentHours   ?? 0,
        nightHours:         body.nightHours        ?? 0,
        xcHours:            body.xcHours           ?? 0,
        simInstrumentHours: body.simInstrumentHours ?? 0,
        dayLandings:        body.dayLandings       ?? 0,
        nightLandings:      body.nightLandings     ?? 0,
        approaches:         body.approaches        ?? 0,
        remarks:            body.remarks,
      })
      return reply.code(201).send({ entryId })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /log?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50&offset=0
   */
  app.get('/log', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { from, to, limit = '50', offset = '0' } = req.query as Record<string, string>

    try {
      const entries = await flightLogV2Service.listLogEntries({
        pilotId: userId,
        from,
        to,
        limit:  parseInt(limit),
        offset: parseInt(offset),
      })
      return reply.send({ entries })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /log/totals
   */
  app.get('/log/totals', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    try {
      const totals = await flightLogV2Service.getLogbookTotals(userId)
      return reply.send(totals)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /log/currency
   * Returns passenger and IFR currency status per FAR 61.57.
   */
  app.get('/log/currency', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    try {
      const currency = await flightLogV2Service.getCurrencyStatus(userId)
      return reply.send(currency)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /log/export?format=csv|json
   */
  app.get('/log/export', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { format = 'json' } = req.query as { format?: 'csv' | 'json' }

    try {
      const output = await flightLogV2Service.exportLogbook(userId, format)
      if (format === 'csv') {
        reply.header('Content-Type', 'text/csv')
        reply.header('Content-Disposition', 'attachment; filename="logbook.csv"')
        return reply.send(output)
      }
      return reply.send(JSON.parse(output))
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Routes ─────────────────────────────────────────────────────────────────

  /**
   * POST /routes
   * Save and optimize a flight route.
   */
  app.post('/routes', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const {
      name, origin, destination, waypoints = [],
      cruiseKtas, fuelBurnGph, usableFuelGal,
    } = req.body as {
      name:           string
      origin:         any
      destination:    any
      waypoints?:     any[]
      cruiseKtas?:    number
      fuelBurnGph?:   number
      usableFuelGal?: number
    }

    if (!name?.trim())   return reply.code(400).send({ error: 'name required' })
    if (!origin)         return reply.code(400).send({ error: 'origin required' })
    if (!destination)    return reply.code(400).send({ error: 'destination required' })

    try {
      const route = await flightLogV2Service.saveRoute({
        pilotId:      userId,
        name,
        origin,
        destination,
        waypoints,
        cruiseKtas,
        fuelBurnGph,
        usableFuelGal,
      })
      return reply.code(201).send(route)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /routes?limit=20&offset=0
   */
  app.get('/routes', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { limit = '20', offset = '0' } = req.query as Record<string, string>

    try {
      const routes = await flightLogV2Service.listRoutes(userId, parseInt(limit), parseInt(offset))
      return reply.send({ routes })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Weather ────────────────────────────────────────────────────────────────

  /**
   * GET /weather/metar?icaos=DNMM,DNKN,DNAA
   */
  app.get('/weather/metar', async (req, reply) => {
    const { icaos = '' } = req.query as { icaos?: string }
    const icaoList = icaos.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)

    if (icaoList.length === 0) return reply.code(400).send({ error: 'icaos required (comma-separated)' })
    if (icaoList.length > 20)  return reply.code(400).send({ error: 'Maximum 20 ICAO codes per request' })

    try {
      const reports = await flightLogV2Service.fetchMETARs(icaoList)
      return reply.send({ reports })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /weather/sigmets?minLat=&maxLat=&minLng=&maxLng=
   */
  app.get('/weather/sigmets', async (req, reply) => {
    const { minLat, maxLat, minLng, maxLng } = req.query as Record<string, string>

    if (!minLat || !maxLat || !minLng || !maxLng) {
      return reply.code(400).send({ error: 'minLat, maxLat, minLng, maxLng required' })
    }

    try {
      const sigmets = await flightLogV2Service.fetchSigmets({
        minLat: parseFloat(minLat), maxLat: parseFloat(maxLat),
        minLng: parseFloat(minLng), maxLng: parseFloat(maxLng),
      })
      return reply.send({ sigmets })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── NOTAMs ─────────────────────────────────────────────────────────────────

  /**
   * GET /notams/:icao
   */
  app.get('/notams/:icao', async (req, reply) => {
    const { icao } = req.params as { icao: string }

    try {
      const notams = await flightLogV2Service.fetchNOTAMs(icao.toUpperCase())
      return reply.send({ icao: icao.toUpperCase(), notams })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
