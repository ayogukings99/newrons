/**
 * Community Treasury & Grants Routes — Phase 5
 * Mount at: /grants
 *
 * Applications:
 *   POST   /applications                             — submit a grant application
 *   GET    /applications                             — list grant applications
 *   GET    /applications/:id                         — get single application
 *
 * Milestones:
 *   POST   /applications/:id/milestones/:order/proof — submit milestone proof
 *   POST   /disbursements/:disbursementId/approve    — approve + disburse (admin)
 *
 * Treasury:
 *   GET    /treasury                                 — treasury balance + report
 */

import { FastifyInstance } from 'fastify'
import { grantsService, GrantStatus, GrantMilestone } from '../services/grants.service'
import { requireAuth } from '../middleware/auth'

export async function grantsRoutes(app: FastifyInstance) {

  // ── Applications ───────────────────────────────────────────────────────────

  app.post('/applications', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { title, description, impactStatement, requestedNxt, milestones } = req.body as {
      title:           string
      description:     string
      impactStatement: string
      requestedNxt:    number
      milestones:      GrantMilestone[]
    }

    if (!title?.trim())           return reply.code(400).send({ error: 'title required' })
    if (!description?.trim())     return reply.code(400).send({ error: 'description required' })
    if (!impactStatement?.trim()) return reply.code(400).send({ error: 'impactStatement required' })
    if (!requestedNxt)            return reply.code(400).send({ error: 'requestedNxt required' })
    if (!Array.isArray(milestones) || milestones.length === 0) {
      return reply.code(400).send({ error: 'milestones array required (min 1)' })
    }

    try {
      const result = await grantsService.submitApplication({
        applicantId: userId, title, description, impactStatement, requestedNxt, milestones,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.get('/applications', async (req, reply) => {
    const { status, limit = '20', offset = '0' } = req.query as Record<string, string>
    try {
      const applications = await grantsService.listApplications({
        status: status as GrantStatus | undefined,
        limit:  parseInt(limit),
        offset: parseInt(offset),
      })
      return reply.send({ applications })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/applications/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const application = await grantsService.getApplication(id)
      if (!application) return reply.code(404).send({ error: 'Grant application not found' })
      return reply.send(application)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Milestones ─────────────────────────────────────────────────────────────

  app.post('/applications/:id/milestones/:order/proof', { preHandler: requireAuth }, async (req, reply) => {
    const userId              = (req.user as { sub: string }).sub as string
    const { id, order }       = req.params as { id: string; order: string }
    const { proofUrl, notes } = req.body as { proofUrl: string; notes?: string }

    if (!proofUrl?.trim()) return reply.code(400).send({ error: 'proofUrl required' })

    try {
      const result = await grantsService.submitMilestoneProof({
        grantId:        id,
        applicantId:    userId,
        milestoneOrder: parseInt(order),
        proofUrl,
        notes,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.post('/disbursements/:disbursementId/approve', { preHandler: [requireAuth, app.requireAdmin] }, async (req, reply) => {
    const userId             = (req.user as { sub: string }).sub as string
    const { disbursementId } = req.params as { disbursementId: string }

    try {
      const result = await grantsService.approveMilestoneDisbursement(disbursementId, userId)
      return reply.send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Treasury ───────────────────────────────────────────────────────────────

  app.get('/treasury', async (_req, reply) => {
    try {
      const report = await grantsService.getTreasuryBalance()
      return reply.send(report)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
