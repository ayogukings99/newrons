import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { groupAudioService } from '../services/group-audio.service'
import { requireAuth } from '../middleware/auth'

const createSessionSchema = z.object({
  hubId: z.string(),
  hubType: z.enum(['barbershop', 'office', 'study', 'household', 'event', 'broadcast']).optional(),
  sessionType: z.enum(['group_listen', 'live_dj', 'broadcast', 'ai_dj']),
  title: z.string().max(100).optional(),
  isPublic: z.boolean().optional(),
})

const effectSchema = z.object({
  effect: z.enum(['reverb', 'echo', 'vinyl', 'rewind', 'none']),
})

const eqSchema = z.object({
  bass: z.number().min(0).max(100),
  mid: z.number().min(0).max(100),
  treble: z.number().min(0).max(100),
})

const setTrackSchema = z.object({
  trackId: z.string(),
  positionMs: z.number().min(0).optional(),
})

const queueTrackSchema = z.object({
  trackId: z.string(),
})

const passDJSchema = z.object({
  newDjId: z.string(),
})

const aiDjSchema = z.object({
  enabled: z.boolean(),
  mood: z.enum(['energetic', 'chill', 'focused', 'celebratory']).optional(),
})

export default async function audioSessionsRoutes(fastify: FastifyInstance) {
  /**
   * POST /audio-sessions
   * Create a new group audio session for a hub.
   */
  fastify.post('/', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const body = createSessionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      const session = await groupAudioService.createSession({ hostId: user.id, ...body.data })
      return reply.status(201).send(session)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  /**
   * GET /audio-sessions/hub/:hubId
   * Get all live sessions for a hub.
   */
  fastify.get('/hub/:hubId', { preHandler: requireAuth }, async (req, reply) => {
    const { hubId } = req.params as { hubId: string }
    try {
      const sessions = await groupAudioService.getHubSessions(hubId)
      return reply.send(sessions)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  /**
   * POST /audio-sessions/:sessionId/join
   * Join a session as a listener.
   * Returns current sync state so client can snap to the right position immediately.
   */
  fastify.post('/:sessionId/join', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    try {
      const syncState = await groupAudioService.joinSession(sessionId, user.id)
      return reply.send(syncState)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  /**
   * POST /audio-sessions/:sessionId/leave
   * Leave a session.
   */
  fastify.post('/:sessionId/leave', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    try {
      await groupAudioService.leaveSession(sessionId, user.id)
      return reply.send({ message: 'Left session' })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  /**
   * GET /audio-sessions/:sessionId/sync
   * Get current sync state.
   * Listeners call this every 10s to stay in sync with the session.
   * Client uses server timestamp for latency-compensated drift correction.
   */
  fastify.get('/:sessionId/sync', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    try {
      const state = await groupAudioService.syncPlayback(sessionId)
      return reply.send(state)
    } catch (err: any) {
      return reply.status(404).send({ error: err.message })
    }
  })

  /**
   * PUT /audio-sessions/:sessionId/track
   * Set the current playing track (DJ/host only).
   */
  fastify.put('/:sessionId/track', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    const body = setTrackSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      const result = await groupAudioService.setTrack(sessionId, user.id, body.data)
      return reply.send(result)
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * POST /audio-sessions/:sessionId/effect
   * Apply a DJ sound effect (reverb, echo, vinyl, none).
   * DJ/host only.
   */
  fastify.post('/:sessionId/effect', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    const body = effectSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      await groupAudioService.applyEffect(sessionId, user.id, body.data.effect)
      return reply.send({ effect: body.data.effect })
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * PUT /audio-sessions/:sessionId/eq
   * Update EQ settings (bass/mid/treble 0-100). DJ/host only.
   */
  fastify.put('/:sessionId/eq', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    const body = eqSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      await groupAudioService.updateEQ(sessionId, user.id, body.data)
      return reply.send({ eq: body.data })
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * POST /audio-sessions/:sessionId/rewind
   * Trigger the iconic rewind effect. DJ/host only.
   * Resets track to position 0 and broadcasts the rewind cue to all listeners.
   */
  fastify.post('/:sessionId/rewind', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    try {
      await groupAudioService.triggerRewind(sessionId, user.id)
      return reply.send({ rewound: true })
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * POST /audio-sessions/:sessionId/queue
   * Add a track to the session queue.
   */
  fastify.post('/:sessionId/queue', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    const body = queueTrackSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      const entry = await groupAudioService.queueTrack(sessionId, user.id, body.data.trackId)
      return reply.status(201).send(entry)
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  /**
   * GET /audio-sessions/:sessionId/queue
   * Get the current track queue for a session.
   */
  fastify.get('/:sessionId/queue', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    try {
      const queue = await groupAudioService.getQueue(sessionId)
      return reply.send(queue)
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  /**
   * POST /audio-sessions/:sessionId/dj/pass
   * Pass the DJ role to another user in the session. Current DJ/host only.
   */
  fastify.post('/:sessionId/dj/pass', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    const body = passDJSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      await groupAudioService.passDJRole(sessionId, user.id, body.data.newDjId)
      return reply.send({ newDjId: body.data.newDjId })
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * PUT /audio-sessions/:sessionId/ai-dj
   * Enable or disable AI DJ mode, and set the mood. Host only.
   */
  fastify.put('/:sessionId/ai-dj', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    const body = aiDjSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues })

    try {
      await groupAudioService.setAIDJMode(sessionId, user.id, body.data)

      // If enabling AI DJ, immediately pick the first track
      if (body.data.enabled) {
        await groupAudioService.runAIDJ(sessionId, user.id)
      }

      return reply.send({ aiDjEnabled: body.data.enabled, mood: body.data.mood })
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * DELETE /audio-sessions/:sessionId
   * End a session (host only).
   */
  fastify.delete('/:sessionId', { preHandler: requireAuth }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const user = (req as any).user
    try {
      await groupAudioService.endSession(sessionId, user.id)
      return reply.send({ ended: true })
    } catch (err: any) {
      return reply.status(403).send({ error: err.message })
    }
  })

  /**
   * WebSocket: /audio-sessions/:sessionId/ws
   * Real-time sync channel for a session.
   *
   * Client sends: { type: 'ping' }
   * Server broadcasts:
   *   { type: 'track_change', trackId, positionMs, timestamp }
   *   { type: 'effect_applied', effect, timestamp }
   *   { type: 'eq_updated', eq, timestamp }
   *   { type: 'rewind', positionMs, timestamp }
   *   { type: 'dj_changed', newDjId }
   *   { type: 'ai_dj_updated', enabled, mood }
   *   { type: 'track_queued', trackId, position, requestedBy }
   *   { type: 'session_ended' }
   */
  // WebSocket endpoint — only registered when websocket plugin is available (not on Vercel)
  if (!process.env.VERCEL) {
    fastify.get('/:sessionId/ws', { websocket: true }, (socket, req) => {
      const { sessionId } = req.params as { sessionId: string }
      groupAudioService.registerWebSocket(sessionId, socket as unknown as WebSocket)
      socket.on('message', (rawMessage) => {
        try {
          const msg = JSON.parse(rawMessage.toString())
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
          }
        } catch {
          // Ignore malformed messages
        }
      })
      socket.on('close', () => {
        // Cleanup is handled by the event listener registered in registerWebSocket
      })
    })
  }
}
