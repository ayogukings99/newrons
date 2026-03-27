/**
 * Public Developer API Routes — Phase 5
 * Mount at: /developer
 *
 * Account:
 *   POST   /account               — register a developer account
 *   GET    /account               — get my developer account
 *   PATCH  /account               — update app name / webhook URL
 *
 * API Keys:
 *   POST   /keys                  — create a new API key (raw key shown once)
 *   GET    /keys                  — list my API keys
 *   DELETE /keys/:keyId           — revoke a key
 *   POST   /keys/:keyId/rotate    — rotate (revoke + reissue)
 *
 * Usage:
 *   GET    /usage/:keyId          — daily usage for last 30 days
 *   GET    /usage/:keyId/summary  — aggregated totals (quota, this-month usage)
 *
 * (Admin)
 *   POST   /admin/reset-monthly   — reset monthly counters (cron trigger)
 */

import { FastifyInstance }  from 'fastify'
import { developerService, ApiKeyScope, ApiKeyEnv } from '../services/developer.service'

export async function developerRoutes(app: FastifyInstance) {

  // ── Account ────────────────────────────────────────────────────────────────

  app.post('/account', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { appName, appUrl } = req.body as { appName: string; appUrl?: string }

    if (!appName?.trim()) return reply.code(400).send({ error: 'appName required' })

    try {
      const account = await developerService.createAccount({ userId, appName, appUrl })
      return reply.code(201).send(account)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.get('/account', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    try {
      const account = await developerService.getAccount(userId)
      if (!account) return reply.code(404).send({ error: 'No developer account found' })
      return reply.send(account)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.patch('/account', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const updates = req.body as { appName?: string; appUrl?: string; webhookUrl?: string }
    try {
      await developerService.updateAccount(userId, updates)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── API Keys ───────────────────────────────────────────────────────────────

  /**
   * POST /keys
   * Body: { name, scopes, env?, expiresAt? }
   * Returns the raw key once — must be saved by the client.
   */
  app.post('/keys', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { name, scopes, env = 'live', expiresAt } = req.body as {
      name:       string
      scopes:     ApiKeyScope[]
      env?:       ApiKeyEnv
      expiresAt?: string
    }

    if (!name?.trim())              return reply.code(400).send({ error: 'name required' })
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return reply.code(400).send({ error: 'scopes array required (translate|logos|clm|coins|nfc|*)' })
    }

    // Get accountId from userId
    const account = await developerService.getAccount(userId)
    if (!account) return reply.code(404).send({ error: 'Developer account not found — create one first' })

    try {
      const result = await developerService.createApiKey({
        accountId: account.id, name, scopes, env, expiresAt,
      })
      return reply.code(201).send(result)  // rawKey included, shown ONCE
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.get('/keys', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const account = await developerService.getAccount(userId)
    if (!account) return reply.code(404).send({ error: 'No developer account found' })

    try {
      const keys = await developerService.listApiKeys(account.id)
      return reply.send({ keys })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.delete('/keys/:keyId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { keyId } = req.params as { keyId: string }

    const account = await developerService.getAccount(userId)
    if (!account) return reply.code(404).send({ error: 'No developer account found' })

    try {
      await developerService.revokeApiKey(keyId, account.id)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.post('/keys/:keyId/rotate', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { keyId } = req.params as { keyId: string }

    const account = await developerService.getAccount(userId)
    if (!account) return reply.code(404).send({ error: 'No developer account found' })

    try {
      const result = await developerService.rotateApiKey(keyId, account.id)
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Usage ──────────────────────────────────────────────────────────────────

  app.get('/usage/:keyId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { keyId } = req.params as { keyId: string }
    const { days = '30' } = req.query as { days?: string }

    const account = await developerService.getAccount(userId)
    if (!account) return reply.code(404).send({ error: 'No developer account found' })

    try {
      const usage = await developerService.getUsageSummary(keyId, parseInt(days))
      return reply.send({ usage })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Admin ──────────────────────────────────────────────────────────────────

  app.post('/admin/reset-monthly', { preHandler: [app.authenticate, app.requireAdmin] }, async (_req, reply) => {
    try {
      await developerService.resetMonthlyUsage()
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
