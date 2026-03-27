/**
 * Community Language Model Routes — Phase 5
 * Mount at: /clm
 *
 * Contributions:
 *   POST   /contributions             — submit a new language data contribution
 *   GET    /contributions/queue       — get contributions pending validation (for validators)
 *   POST   /contributions/:id/vote    — cast a validation vote
 *
 * Dataset:
 *   GET    /dataset/stats             — overall dataset statistics (public)
 *   GET    /dataset/versions          — list versioned dataset snapshots
 *   POST   /dataset/versions          — create new version (DAO-admin only)
 *
 * Contributors:
 *   GET    /contributors/me           — my contribution stats + earnings
 *   GET    /contributors/leaderboard  — top contributors leaderboard
 */

import { FastifyInstance } from 'fastify'
import { clmService, ContributionType, ContributionDomain, SupportedCLMLang, ValidationVote } from '../services/clm.service'

export async function clmRoutes(app: FastifyInstance) {

  // ── Contributions ──────────────────────────────────────────────────────────

  /**
   * POST /contributions
   * Submit new language data.
   */
  app.post('/contributions', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const {
      type, languageCode, domain, content,
      dialectTag, targetContent, targetLang, durationSecs,
    } = req.body as {
      type:           ContributionType
      languageCode:   SupportedCLMLang
      domain:         ContributionDomain
      content:        string
      dialectTag?:    string
      targetContent?: string
      targetLang?:    SupportedCLMLang
      durationSecs?:  number
    }

    if (!type)         return reply.code(400).send({ error: 'type required (text|audio|translation_pair)' })
    if (!languageCode) return reply.code(400).send({ error: 'languageCode required' })
    if (!domain)       return reply.code(400).send({ error: 'domain required' })
    if (!content?.trim()) return reply.code(400).send({ error: 'content required' })

    try {
      const result = await clmService.submitContribution({
        contributorId: userId, type, languageCode, domain, content,
        dialectTag, targetContent, targetLang, durationSecs,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /contributions/queue?languageCode=yo&domain=general&limit=10
   * Fetch contributions in the validation queue for the authenticated validator.
   */
  app.get('/contributions/queue', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { languageCode, domain, limit = '10' } = req.query as Record<string, string>

    try {
      const contributions = await clmService.getPendingForValidation({
        validatorId:  userId,
        languageCode: languageCode as SupportedCLMLang | undefined,
        domain:       domain       as ContributionDomain | undefined,
        limit:        parseInt(limit),
      })
      return reply.send({ contributions })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * POST /contributions/:id/vote
   * Body: { vote: 'approve' | 'reject', reason? }
   */
  app.post('/contributions/:id/vote', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { id }             = req.params as { id: string }
    const { vote, reason }   = req.body   as { vote: ValidationVote; reason?: string }

    if (!['approve', 'reject'].includes(vote)) {
      return reply.code(400).send({ error: 'vote must be "approve" or "reject"' })
    }

    try {
      const result = await clmService.castValidationVote({
        validatorId: userId, contributionId: id, vote, reason,
      })
      return reply.send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Dataset ────────────────────────────────────────────────────────────────

  /**
   * GET /dataset/stats
   * Public endpoint — overview of the training dataset.
   */
  app.get('/dataset/stats', async (_req, reply) => {
    try {
      const stats = await clmService.getDatasetStats()
      return reply.send(stats)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /dataset/versions
   * List all published dataset versions.
   */
  app.get('/dataset/versions', async (req, reply) => {
    const { limit = '20' } = req.query as { limit?: string }
    try {
      const versions = await clmService.listDatasetVersions(parseInt(limit))
      return reply.send({ versions })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * POST /dataset/versions  (admin/DAO execution only)
   * Body: { versionLabel, notes? }
   */
  app.post('/dataset/versions', { preHandler: [app.authenticate, app.requireAdmin] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { versionLabel, notes } = req.body as { versionLabel: string; notes?: string }

    if (!versionLabel?.trim()) return reply.code(400).send({ error: 'versionLabel required' })

    try {
      const result = await clmService.createDatasetVersion({
        createdBy: userId, versionLabel, notes,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Contributors ───────────────────────────────────────────────────────────

  /**
   * GET /contributors/me
   * My contribution stats and coin earnings.
   */
  app.get('/contributors/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    try {
      const stats = await clmService.getContributorStats(userId)
      return reply.send(stats)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /contributors/leaderboard?limit=50
   */
  app.get('/contributors/leaderboard', async (req, reply) => {
    const { limit = '50' } = req.query as { limit?: string }
    try {
      const leaderboard = await clmService.getLeaderboard(parseInt(limit))
      return reply.send({ leaderboard })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
