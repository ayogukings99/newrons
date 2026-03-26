import { FastifyInstance } from 'fastify'

export default async function audioSessionsRoutes(app: FastifyInstance) {
  // POST /api/v1/audio-sessions — Create a group audio session
  app.post('/', async (req, reply) => {
    // Creates a new group listen / live DJ / broadcast / AI DJ session
    return reply.code(501).send({ message: 'TODO: create audio session' })
  })

  // GET /api/v1/audio-sessions/:sessionId — Get session state
  app.get('/:sessionId', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: get audio session' })
  })

  // GET /api/v1/audio-sessions/:sessionId/sync — Get sync state for playback
  app.get('/:sessionId/sync', async (req, reply) => {
    // Returns current track, position_ms, server timestamp for drift correction
    // Listeners call this every 10s to stay in sync
    return reply.code(501).send({ message: 'TODO: get sync state' })
  })

  // POST /api/v1/audio-sessions/:sessionId/effect — Apply DJ effect
  app.post('/:sessionId/effect', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: apply DJ effect' })
  })

  // PUT /api/v1/audio-sessions/:sessionId/eq — Update EQ settings
  app.put('/:sessionId/eq', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: update EQ settings' })
  })

  // POST /api/v1/audio-sessions/:sessionId/rewind — Trigger rewind effect
  app.post('/:sessionId/rewind', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: trigger rewind' })
  })

  // POST /api/v1/audio-sessions/:sessionId/ai-dj — Enable/run AI DJ
  app.post('/:sessionId/ai-dj', async (req, reply) => {
    // AI selects next track based on mood, time, hub activity
    return reply.code(501).send({ message: 'TODO: run AI DJ' })
  })

  // POST /api/v1/audio-sessions/:sessionId/queue — Add track to queue
  app.post('/:sessionId/queue', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: queue track' })
  })

  // DELETE /api/v1/audio-sessions/:sessionId — End session
  app.delete('/:sessionId', async (req, reply) => {
    return reply.code(501).send({ message: 'TODO: end audio session' })
  })

  // WebSocket: /api/v1/audio-sessions/:sessionId/ws — Real-time sync channel
  app.get('/:sessionId/ws', { websocket: true }, (socket, req) => {
    socket.on('message', (message) => {
      // Handle: join, leave, playback-event, reaction, dj-action
    })
  })
}
