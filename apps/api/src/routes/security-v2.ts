/**
 * Security Intelligence v2 Routes — Phase 4
 * Mount at: /security
 *
 * Community Incident Reporting:
 *   POST   /reports                           — submit a safety report
 *   GET    /incidents/nearby                  — get confirmed incidents near a location
 *   PATCH  /incidents/:incidentId/status      — resolve or dismiss (admin)
 *
 * Trusted Contacts:
 *   GET    /contacts                          — list my trusted contacts
 *   POST   /contacts/:contactId              — add trusted contact
 *   DELETE /contacts/:contactId              — remove trusted contact
 *
 * Live Safety Companion:
 *   POST   /companion/sessions               — start a live location session
 *   PATCH  /companion/sessions/:sessionId/location — update live location
 *   DELETE /companion/sessions/:sessionId    — end session
 *   GET    /companion/sessions/:sessionId    — get session + current location
 *   GET    /companion/watching               — list sessions where I'm a watcher
 *   POST   /companion/sos                    — trigger SOS panic alert
 */

import { FastifyInstance } from 'fastify'
import { securityV2Service, IncidentType, IncidentSeverity } from '../services/security-v2.service'
import { requireAuth } from '../middleware/auth'

export async function securityV2Routes(app: FastifyInstance) {

  // ── Community Incident Reporting ───────────────────────────────────────────

  /**
   * POST /reports
   * Submit a new community safety report.
   */
  app.post('/reports', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { type, severity, latitude, longitude, description, anonymous = true } = req.body as {
      type:        IncidentType
      severity:    IncidentSeverity
      latitude:    number
      longitude:   number
      description: string
      anonymous?:  boolean
    }

    if (!type)        return reply.code(400).send({ error: 'type required' })
    if (!severity)    return reply.code(400).send({ error: 'severity required' })
    if (latitude  == null) return reply.code(400).send({ error: 'latitude required' })
    if (longitude == null) return reply.code(400).send({ error: 'longitude required' })
    if (!description?.trim()) return reply.code(400).send({ error: 'description required' })

    try {
      const result = await securityV2Service.submitReport({
        reporterId: userId, type, severity, latitude, longitude, description, anonymous,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /incidents/nearby?lat=&lng=&radius=2000&limit=30
   * Fetch confirmed and validating incidents near a coordinate.
   */
  app.get('/incidents/nearby', async (req, reply) => {
    const { lat, lng, radius = '2000', limit = '30' } = req.query as Record<string, string>

    if (!lat || !lng) return reply.code(400).send({ error: 'lat and lng required' })

    try {
      const incidents = await securityV2Service.getNearbyIncidents({
        latitude:      parseFloat(lat),
        longitude:     parseFloat(lng),
        radiusMeters:  parseInt(radius),
        limit:         parseInt(limit),
      })
      return reply.send({ incidents })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * PATCH /incidents/:incidentId/status  (admin)
   * Body: { status: 'resolved' | 'dismissed', summary? }
   */
  app.patch('/incidents/:incidentId/status', { preHandler: [requireAuth, app.requireAdmin] }, async (req, reply) => {
    const { incidentId } = req.params as { incidentId: string }
    const { status, summary } = req.body as { status: 'resolved' | 'dismissed'; summary?: string }

    if (!['resolved', 'dismissed'].includes(status)) {
      return reply.code(400).send({ error: 'status must be resolved or dismissed' })
    }

    try {
      await securityV2Service.updateIncidentStatus(incidentId, status, summary)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Trusted Contacts ───────────────────────────────────────────────────────

  /**
   * GET /contacts
   * List my trusted contacts with mutual trust status.
   */
  app.get('/contacts', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    try {
      const contacts = await securityV2Service.listTrustedContacts(userId)
      return reply.send({ contacts })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * POST /contacts/:contactId
   * Add a user as a trusted contact.
   */
  app.post('/contacts/:contactId', { preHandler: requireAuth }, async (req, reply) => {
    const userId    = (req.user as { sub: string }).sub as string
    const { contactId } = req.params as { contactId: string }

    try {
      await securityV2Service.addTrustedContact(userId, contactId)
      return reply.code(201).send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * DELETE /contacts/:contactId
   * Remove a trusted contact.
   */
  app.delete('/contacts/:contactId', { preHandler: requireAuth }, async (req, reply) => {
    const userId    = (req.user as { sub: string }).sub as string
    const { contactId } = req.params as { contactId: string }

    try {
      await securityV2Service.removeTrustedContact(userId, contactId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Live Safety Companion ──────────────────────────────────────────────────

  /**
   * POST /companion/sessions
   * Start a live location sharing session.
   * Body: { latitude, longitude, durationMinutes?, watcherIds? }
   */
  app.post('/companion/sessions', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { latitude, longitude, durationMinutes = 60, watcherIds = [] } = req.body as {
      latitude:          number
      longitude:         number
      durationMinutes?:  number
      watcherIds?:       string[]
    }

    if (latitude  == null) return reply.code(400).send({ error: 'latitude required' })
    if (longitude == null) return reply.code(400).send({ error: 'longitude required' })

    try {
      const result = await securityV2Service.startCompanionSession({
        sharerId: userId, latitude, longitude, durationMinutes, watcherIds,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * PATCH /companion/sessions/:sessionId/location
   * Push a location update during an active session.
   * Body: { latitude, longitude }
   */
  app.patch('/companion/sessions/:sessionId/location', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { sessionId } = req.params as { sessionId: string }
    const { latitude, longitude } = req.body as { latitude: number; longitude: number }

    if (latitude  == null) return reply.code(400).send({ error: 'latitude required' })
    if (longitude == null) return reply.code(400).send({ error: 'longitude required' })

    try {
      await securityV2Service.updateCompanionLocation({ sessionId, sharerId: userId, latitude, longitude })
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /companion/sessions/:sessionId
   * Get session details + current sharer location (sharer or watcher only).
   */
  app.get('/companion/sessions/:sessionId', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { sessionId } = req.params as { sessionId: string }

    try {
      const session = await securityV2Service.getCompanionSession(sessionId, userId)
      if (!session) return reply.code(404).send({ error: 'Session not found or expired' })
      return reply.send(session)
    } catch (err: any) {
      return reply.code(403).send({ error: err.message })
    }
  })

  /**
   * DELETE /companion/sessions/:sessionId
   * End a session (sharer or watcher can end it).
   */
  app.delete('/companion/sessions/:sessionId', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { sessionId } = req.params as { sessionId: string }

    try {
      await securityV2Service.endCompanionSession(sessionId, userId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /companion/watching
   * List all active sessions where I am a watcher.
   */
  app.get('/companion/watching', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    try {
      const sessions = await securityV2Service.getWatchedSessions(userId)
      return reply.send({ sessions })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * POST /companion/sos
   * Panic trigger — broadcasts location to all trusted contacts immediately.
   * Body: { latitude, longitude }
   */
  app.post('/companion/sos', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { latitude, longitude } = req.body as { latitude: number; longitude: number }

    if (latitude  == null) return reply.code(400).send({ error: 'latitude required' })
    if (longitude == null) return reply.code(400).send({ error: 'longitude required' })

    try {
      const result = await securityV2Service.triggerSOS({ sharerId: userId, latitude, longitude })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
