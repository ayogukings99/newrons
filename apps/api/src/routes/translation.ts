/**
 * Translation Routes — Phase 4
 * Mount at: /translate
 *
 * Text Translation:
 *   POST /text               — translate a single string
 *   POST /batch              — translate up to 50 strings
 *
 * Language Detection:
 *   POST /detect             — detect the language of text
 *
 * Audio Translation:
 *   POST /audio              — speech-to-speech translation (base64 WAV/MP3)
 *
 * Live Session:
 *   POST /sessions           — create a live translation session (Group Audio integration)
 *   DELETE /sessions/:id     — end a live translation session
 *
 * Supported languages:
 *   en, fr, ar, sw, yo, ig, ha, zu, am, pcm, af, xh, so, pt, es, de, it, ru, zh, hi
 */

import { FastifyInstance } from 'fastify'
import { translationService, SupportedLang } from '../services/translation.service'

export async function translationRoutes(app: FastifyInstance) {

  // ── Text Translation ───────────────────────────────────────────────────────

  /**
   * POST /text
   * Body: { text, targetLang, sourceLang? }
   */
  app.post('/text', async (req, reply) => {
    const { text, targetLang, sourceLang } = req.body as {
      text:        string
      targetLang:  SupportedLang
      sourceLang?: SupportedLang
    }

    if (!text?.trim())  return reply.code(400).send({ error: 'text required' })
    if (!targetLang)    return reply.code(400).send({ error: 'targetLang required' })

    try {
      const result = await translationService.translateText({ text, sourceLang, targetLang })
      return reply.send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /batch
   * Body: { texts: string[], targetLang, sourceLang? }
   */
  app.post('/batch', async (req, reply) => {
    const { texts, targetLang, sourceLang } = req.body as {
      texts:       string[]
      targetLang:  SupportedLang
      sourceLang?: SupportedLang
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      return reply.code(400).send({ error: 'texts array required' })
    }
    if (!targetLang) return reply.code(400).send({ error: 'targetLang required' })

    try {
      const results = await translationService.translateBatch({ texts, sourceLang, targetLang })
      return reply.send({ results })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Language Detection ─────────────────────────────────────────────────────

  /**
   * POST /detect
   * Body: { text }
   */
  app.post('/detect', async (req, reply) => {
    const { text } = req.body as { text: string }

    if (!text?.trim()) return reply.code(400).send({ error: 'text required' })

    try {
      const languages = await translationService.detectLanguage(text)
      return reply.send({ languages })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Audio Translation ──────────────────────────────────────────────────────

  /**
   * POST /audio
   * Body: { audioBase64, sourceLang, targetLang, synthesize? }
   * Transcribes speech, translates, and optionally synthesizes back to audio.
   */
  app.post('/audio', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { audioBase64, sourceLang, targetLang, synthesize = false } = req.body as {
      audioBase64: string
      sourceLang:  SupportedLang
      targetLang:  SupportedLang
      synthesize?: boolean
    }

    if (!audioBase64) return reply.code(400).send({ error: 'audioBase64 required' })
    if (!sourceLang)  return reply.code(400).send({ error: 'sourceLang required' })
    if (!targetLang)  return reply.code(400).send({ error: 'targetLang required' })

    try {
      const result = await translationService.translateAudio({
        audioBase64, sourceLang, targetLang, synthesize,
      })
      return reply.send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Live Translation Sessions ──────────────────────────────────────────────

  /**
   * POST /sessions
   * Create a live translation session for Group Audio captions.
   * Body: { roomId, sourceLang, targetLangs }
   */
  app.post('/sessions', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { roomId, sourceLang, targetLangs } = req.body as {
      roomId:      string
      sourceLang:  SupportedLang
      targetLangs: SupportedLang[]
    }

    if (!roomId)                          return reply.code(400).send({ error: 'roomId required' })
    if (!sourceLang)                      return reply.code(400).send({ error: 'sourceLang required' })
    if (!Array.isArray(targetLangs) || targetLangs.length === 0) {
      return reply.code(400).send({ error: 'targetLangs array required' })
    }

    try {
      const session = await translationService.createLiveSession({
        userId, roomId, sourceLang, targetLangs,
      })
      return reply.code(201).send(session)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * DELETE /sessions/:sessionId
   * End a live translation session.
   */
  app.delete('/sessions/:sessionId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }

    try {
      await translationService.endLiveSession(sessionId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })
}
