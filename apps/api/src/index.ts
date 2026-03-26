import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import { config } from './utils/config'

// Routes
import worldScansRoutes from './routes/world-scans'
import languagesRoutes from './routes/languages'
import nfcPaymentsRoutes from './routes/nfc-payments'
import audioSessionsRoutes from './routes/audio-sessions'
import barbershopsRoutes from './routes/barbershops'
import securityRoutes from './routes/security'
import knowledgeBasesRoutes from './routes/knowledge-bases'
import quizzesRoutes from './routes/quizzes'

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

// Health
app.get('/health', async () => ({ status: 'ok', version: '0.1.0', project: 'NEXUS' }))

// Start
const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    app.log.info(`NEXUS API running on port ${config.PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
