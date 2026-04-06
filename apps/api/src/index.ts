import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import { config } from './utils/config'

// Jobs
import { runLogosSignalExtraction } from './jobs/logos-signal-extractor'

// Routes
import worldScansRoutes from './routes/world-scans'
import languagesRoutes from './routes/languages'
import nfcPaymentsRoutes from './routes/nfc-payments'
import audioSessionsRoutes from './routes/audio-sessions'
import barbershopsRoutes from './routes/barbershops'
import securityRoutes from './routes/security'
import knowledgeBasesRoutes from './routes/knowledge-bases'
import quizzesRoutes from './routes/quizzes'
import integrationRoutes from './routes/integration'

const app = Fastify({ logger: { level: config.LOG_LEVEL } })

// Plugins
app.register(cors, { origin: config.CORS_ORIGINS.split(',') })
app.register(jwt, { secret: config.SUPABASE_JWT_SECRET })
app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }) // 100MB
app.register(websocket)

// Routes — v1
const API_PREFIX = '/api/v1'
app.register(worldScansRoutes,    { prefix: `${API_PREFIX}/world-scans` })
app.register(languagesRoutes,     { prefix: `${API_PREFIX}/languages` })
app.register(nfcPaymentsRoutes,   { prefix: `${API_PREFIX}/nfc-payments` })
app.register(audioSessionsRoutes, { prefix: `${API_PREFIX}/audio-sessions` })
app.register(barbershopsRoutes,   { prefix: `${API_PREFIX}/barbershops` })
app.register(securityRoutes,      { prefix: `${API_PREFIX}/security` })
app.register(knowledgeBasesRoutes,{ prefix: `${API_PREFIX}/knowledge-bases` })
app.register(quizzesRoutes,       { prefix: `${API_PREFIX}/quizzes` })

// Integration layer — bridges social + economic identity
app.register(integrationRoutes,   { prefix: `${API_PREFIX}/integration` })

// Health
app.get('/health', async () => ({ status: 'ok', version: '0.1.0', project: 'NEXUS' }))

// Start
const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    app.log.info(`NEXUS API running on port ${config.PORT}`)

    // LOGOS signal extraction — run on startup then every 6 hours
    // Delay initial run by 30s to let DB connections stabilise
    setTimeout(() => {
      runLogosSignalExtraction().catch(err =>
        app.log.error({ err }, 'LOGOS signal extraction failed on startup')
      )
    }, 30_000)

    setInterval(() => {
      runLogosSignalExtraction().catch(err =>
        app.log.error({ err }, 'LOGOS signal extraction failed')
      )
    }, 6 * 60 * 60 * 1_000) // every 6 hours
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// Vercel serverless handler — export the app for serverless environments
// In production (Vercel), the function is invoked per-request, not via listen()
if (process.env.VERCEL) {
  // Ready the app without listening on a port
  app.ready().catch(err => {
    console.error('Fastify ready error:', err)
  })
  module.exports = async (req: any, res: any) => {
    await app.ready()
    app.server.emit('request', req, res)
  }
} else {
  start()
}
