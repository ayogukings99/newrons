/**
 * Creator Economy routes — Phase 3
 *
 * Mount at: /creator
 *
 * Content:
 *   POST   /content/upload-url           — get presigned R2 upload URL
 *   POST   /content                      — publish content record
 *   GET    /content                      — list public content (paginated)
 *   GET    /content/mine                 — creator's own content
 *   GET    /content/:contentId           — get single content item
 *   PATCH  /content/:contentId           — update content
 *
 * Transactions:
 *   POST   /content/:contentId/purchase  — record purchase (post-payment)
 *   POST   /content/:contentId/tip       — send tip
 *
 * Subscriptions:
 *   POST   /subscribe/:creatorId         — subscribe to a creator
 *   DELETE /subscribe/:creatorId         — cancel subscription
 *   GET    /subscribe/:creatorId/check   — is user subscribed?
 *
 * Affiliate:
 *   POST   /content/:contentId/affiliate — create affiliate link
 *   GET    /affiliate/:code/click        — track affiliate click
 *
 * Creator dashboard:
 *   GET    /dashboard                    — earnings + stats
 *   GET    /payouts                      — payout history
 *   POST   /payouts/request              — request payout
 */

import { FastifyInstance } from 'fastify'
import { creatorEconomyService, ContentType, PricingModel } from '../services/creator-economy.service'

export async function creatorEconomyRoutes(app: FastifyInstance) {

  // ── Upload URL ────────────────────────────────────────────────────────────

  app.post('/content/upload-url', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { contentType, mimeType } = req.body as { contentType: ContentType; mimeType: string }

    if (!contentType || !mimeType) return reply.code(400).send({ error: 'contentType and mimeType required' })

    try {
      const result = await creatorEconomyService.getUploadUrl(userId, contentType, mimeType)
      return reply.send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Publish content ───────────────────────────────────────────────────────

  app.post('/content', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const {
      title, description, contentType, mediaKey, thumbnailKey,
      pricingModel, priceAmount, priceCurrency, tags, isPublished = false,
    } = req.body as {
      title: string; description: string; contentType: ContentType
      mediaKey: string; thumbnailKey?: string
      pricingModel: PricingModel; priceAmount?: number; priceCurrency?: string
      tags?: string[]; isPublished?: boolean
    }

    if (!title?.trim())   return reply.code(400).send({ error: 'title required' })
    if (!contentType)     return reply.code(400).send({ error: 'contentType required' })
    if (!mediaKey)        return reply.code(400).send({ error: 'mediaKey required' })
    if (!pricingModel)    return reply.code(400).send({ error: 'pricingModel required' })

    try {
      const result = await creatorEconomyService.publishContent({
        creatorId: userId, title, description, contentType, mediaKey,
        thumbnailKey, pricingModel, priceAmount, priceCurrency, tags, isPublished,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── List public content ───────────────────────────────────────────────────

  app.get('/content', async (req, reply) => {
    const { limit = '20', offset = '0', contentType, creatorId, tag, pricingModel } = req.query as Record<string, string>
    try {
      const items = await creatorEconomyService.listPublicContent({
        limit:        parseInt(limit),
        offset:       parseInt(offset),
        contentType:  contentType as ContentType | undefined,
        creatorId,
        tag,
        pricingModel: pricingModel as PricingModel | undefined,
      })
      return reply.send(items)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── My content ────────────────────────────────────────────────────────────

  app.get('/content/mine', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { limit = '20', offset = '0' } = req.query as Record<string, string>
    try {
      const items = await creatorEconomyService.listPublicContent({
        creatorId: userId,
        limit:     parseInt(limit),
        offset:    parseInt(offset),
      })
      return reply.send(items)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Get single content ────────────────────────────────────────────────────

  app.get('/content/:contentId', async (req, reply) => {
    const { contentId } = req.params as { contentId: string }
    const userId = (req as any).userId as string | undefined
    try {
      const item = await creatorEconomyService.getContent(contentId, userId)
      return reply.send(item)
    } catch (err: any) {
      return reply.code(404).send({ error: err.message })
    }
  })

  // ── Update content ────────────────────────────────────────────────────────

  app.patch('/content/:contentId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { contentId } = req.params as { contentId: string }
    const userId = (req as any).userId as string
    const updates = req.body as {
      title?: string; description?: string; isPublished?: boolean
      priceAmount?: number; pricingModel?: PricingModel; tags?: string[]
    }
    try {
      await creatorEconomyService.updateContent(contentId, userId, updates)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Purchase ──────────────────────────────────────────────────────────────

  app.post('/content/:contentId/purchase', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { contentId } = req.params as { contentId: string }
    const userId = (req as any).userId as string
    const { amountPaid, currency = 'NGN', paymentRef, affiliateCode } = req.body as {
      amountPaid: number; currency?: string; paymentRef: string; affiliateCode?: string
    }

    if (!paymentRef) return reply.code(400).send({ error: 'paymentRef required' })
    if (!amountPaid) return reply.code(400).send({ error: 'amountPaid required' })

    try {
      const result = await creatorEconomyService.recordPurchase({
        contentId, buyerId: userId, amountPaid, currency, paymentRef, affiliateCode,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Tip ───────────────────────────────────────────────────────────────────

  app.post('/content/:contentId/tip', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { contentId } = req.params as { contentId: string }
    const userId = (req as any).userId as string
    const { amount, currency = 'NGN', message, paymentRef } = req.body as {
      amount: number; currency?: string; message?: string; paymentRef: string
    }

    if (!amount)     return reply.code(400).send({ error: 'amount required' })
    if (!paymentRef) return reply.code(400).send({ error: 'paymentRef required' })

    try {
      const result = await creatorEconomyService.recordTip({
        contentId, tipperId: userId, amount, currency, message, paymentRef,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Subscriptions ─────────────────────────────────────────────────────────

  app.post('/subscribe/:creatorId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { creatorId } = req.params as { creatorId: string }
    const userId = (req as any).userId as string
    const { plan, amount, currency = 'NGN', paymentRef } = req.body as {
      plan: 'monthly' | 'yearly'; amount: number; currency?: string; paymentRef: string
    }

    if (!plan || !amount || !paymentRef) {
      return reply.code(400).send({ error: 'plan, amount, paymentRef required' })
    }

    try {
      await creatorEconomyService.subscribe({
        subscriberId: userId, creatorId, plan, amount, currency, paymentRef,
      })
      return reply.code(201).send({ ok: true })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.delete('/subscribe/:creatorId', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { creatorId } = req.params as { creatorId: string }
    const userId = (req as any).userId as string
    try {
      await creatorEconomyService.cancelSubscription(userId, creatorId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/subscribe/:creatorId/check', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { creatorId } = req.params as { creatorId: string }
    const userId = (req as any).userId as string
    try {
      const active = await creatorEconomyService.checkSubscription(userId, creatorId)
      return reply.send({ subscribed: active })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Affiliate ─────────────────────────────────────────────────────────────

  app.post('/content/:contentId/affiliate', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { contentId } = req.params as { contentId: string }
    const userId = (req as any).userId as string
    const { commissionPct = 5 } = req.body as { commissionPct?: number }
    try {
      const result = await creatorEconomyService.createAffiliateLink(userId, contentId, commissionPct)
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/affiliate/:code/click', async (req, reply) => {
    const { code } = req.params as { code: string }
    await creatorEconomyService.trackAffiliateClick(code).catch(() => {})
    return reply.send({ ok: true })
  })

  // ── Creator Dashboard ─────────────────────────────────────────────────────

  app.get('/dashboard', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    try {
      const stats = await creatorEconomyService.creatorStats(userId)
      return reply.send(stats)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/payouts', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    try {
      const history = await creatorEconomyService.payoutHistory(userId)
      return reply.send(history)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.post('/payouts/request', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string
    const { amount, currency = 'NGN', bankRef } = req.body as {
      amount: number; currency?: string; bankRef: string
    }

    if (!amount || !bankRef) return reply.code(400).send({ error: 'amount and bankRef required' })

    try {
      const payoutId = await creatorEconomyService.requestPayout(userId, amount, currency, bankRef)
      return reply.code(201).send({ payoutId })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
