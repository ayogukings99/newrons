import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { LanguageService } from '../services/language.service'

const service = new LanguageService()

const ContributeSchema = z.object({
  languageId: z.string(),
  type: z.enum(['correction', 'new_phrase', 'dialect_variant', 'pronunciation']),
  originalText: z.string().min(1),
  aiOutput: z.string().min(1),
  correctedText: z.string().min(1),
  context: z.string().optional(),
  dialectVariant: z.string().optional(),
})

const PreferencesSchema = z.object({
  primaryLanguageId: z.string().optional(),
  secondaryLanguages: z.array(z.string()).optional(),
  dialect: z.string().optional(),
  aiResponseLanguage: z.enum(['match_input', 'primary', 'english']).optional(),
  translateContent: z.boolean().optional(),
})

async function getUserId(req: FastifyRequest): Promise<string> {
  await req.jwtVerify()
  return (req.user as { sub: string }).sub
}

export default async function languagesRoutes(app: FastifyInstance) {

  // GET /api/v1/languages — List all active supported languages
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { tier } = req.query as { tier?: string }
    const languages = await service.listLanguages(tier ? parseInt(tier) : undefined)
    return reply.send({ data: languages })
  })

  // POST /api/v1/languages/detect — Detect language from text
  app.post('/detect', async (req: FastifyRequest, reply: FastifyReply) => {
    const { text } = req.body as { text: string }
    if (!text?.trim()) return reply.code(400).send({ error: 'text is required' })
    const result = await service.detectLanguage(text)
    return reply.send({ data: result })
  })

  // POST /api/v1/languages/translate — Translate text
  app.post('/translate', async (req: FastifyRequest, reply: FastifyReply) => {
    const { text, fromCode, toCode } = req.body as {
      text: string; fromCode: string; toCode: string
    }
    if (!text || !fromCode || !toCode) {
      return reply.code(400).send({ error: 'text, fromCode, and toCode are required' })
    }
    const translated = await service.translate({ text, fromCode, toCode })
    return reply.send({ data: { translated, fromCode, toCode } })
  })

  // POST /api/v1/languages/synthesize — Text to speech
  app.post('/synthesize', async (req: FastifyRequest, reply: FastifyReply) => {
    const { text, languageCode, dialect } = req.body as {
      text: string; languageCode: string; dialect?: string
    }
    if (!text || !languageCode) {
      return reply.code(400).send({ error: 'text and languageCode are required' })
    }
    const audioUrl = await service.synthesizeSpeech({ text, languageCode, dialect })
    return reply.send({ data: { audioUrl } })
  })

  // POST /api/v1/languages/transcribe — Speech to text
  app.post('/transcribe', async (req: FastifyRequest, reply: FastifyReply) => {
    const { audioUrl, languageCode, dialect } = req.body as {
      audioUrl: string; languageCode: string; dialect?: string
    }
    if (!audioUrl || !languageCode) {
      return reply.code(400).send({ error: 'audioUrl and languageCode are required' })
    }
    const text = await service.transcribeSpeech({ audioUrl, languageCode, dialect })
    return reply.send({ data: { text } })
  })

  // POST /api/v1/languages/contribute — Submit a training correction
  app.post('/contribute', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = ContributeSchema.parse(req.body)
    const contribution = await service.submitTrainingContribution({
      contributorId: userId,
      ...body,
    })
    return reply.code(201).send({ data: contribution })
  })

  // GET /api/v1/languages/contributions/pending?languageId=xxx — Contributions awaiting validation
  app.get('/contributions/pending', async (req: FastifyRequest, reply: FastifyReply) => {
    const { languageId, limit } = req.query as { languageId: string; limit?: string }
    if (!languageId) return reply.code(400).send({ error: 'languageId is required' })
    const contributions = await service.getPendingContributions(
      languageId,
      limit ? parseInt(limit) : 20
    )
    return reply.send({ data: contributions })
  })

  // POST /api/v1/languages/contributions/:id/validate — Upvote a contribution
  app.post<{ Params: { id: string } }>(
    '/contributions/:id/validate',
    async (req, reply) => {
      const userId = await getUserId(req)
      await service.validateContribution(req.params.id, userId)
      return reply.code(204).send()
    }
  )

  // GET /api/v1/languages/preferences — Get user language preferences
  app.get('/preferences', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const prefs = await service.getUserPreferences(userId)
    return reply.send({ data: prefs })
  })

  // PUT /api/v1/languages/preferences — Update user language preferences
  app.put('/preferences', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = PreferencesSchema.parse(req.body)
    const prefs = await service.updateUserPreferences(userId, body)
    return reply.send({ data: prefs })
  })
}
