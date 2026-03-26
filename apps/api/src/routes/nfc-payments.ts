import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { NFCPaymentService } from '../services/nfc-payment.service'

const service = new NFCPaymentService()

// ── Schemas ────────────────────────────────────────────────────
const CreateTagSchema = z.object({
  label: z.string().min(1).max(100),
  defaultAmount: z.number().positive().optional(),
  currency: z.string().length(3).default('NGN'),
  category: z.enum(['transport', 'food', 'market', 'service', 'entertainment', 'religious']),
  geoPoint: z.object({ lat: z.number(), lng: z.number() }).optional(),
})

const ProcessTapSchema = z.object({
  nfcUid: z.string().optional(),
  tagId: z.string().optional(),
  receiverId: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('NGN'),
})

const SyncOfflineSchema = z.object({
  taps: z.array(z.object({
    nfcUid: z.string(),
    amount: z.number().positive(),
    currency: z.string().length(3).optional(),
    offlineCreatedAt: z.string().datetime(),
    idempotencyKey: z.string().uuid(),
  })).max(50),
})

// ── Route helper: get userId from JWT ─────────────────────────
async function getUserId(req: FastifyRequest): Promise<string> {
  await req.jwtVerify()
  const payload = req.user as { sub: string }
  return payload.sub
}

export default async function nfcPaymentsRoutes(app: FastifyInstance) {

  // POST /api/v1/nfc-payments/tags — Create an NFC payment tag
  app.post('/tags', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = CreateTagSchema.parse(req.body)
    const tag = await service.createTag({ ownerId: userId, ...body })
    return reply.code(201).send({ data: tag })
  })

  // GET /api/v1/nfc-payments/tags — List user's NFC tags
  app.get('/tags', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const tags = await service.listUserTags(userId)
    return reply.send({ data: tags })
  })

  // GET /api/v1/nfc-payments/tags/uid/:uid — Resolve tag by hardware NFC UID
  app.get<{ Params: { uid: string } }>(
    '/tags/uid/:uid',
    async (req, reply) => {
      // Called immediately when a phone scans an NFC tag — no auth required
      const tag = await service.resolveTagByUID(req.params.uid)
      return reply.send({ data: tag })
    }
  )

  // GET /api/v1/nfc-payments/tags/qr/:shortCode — Resolve tag by QR code
  app.get<{ Params: { shortCode: string } }>(
    '/tags/qr/:shortCode',
    async (req, reply) => {
      const tag = await service.resolveTagByQR(req.params.shortCode)
      return reply.send({ data: tag })
    }
  )

  // DELETE /api/v1/nfc-payments/tags/:tagId — Deactivate a tag
  app.delete<{ Params: { tagId: string } }>(
    '/tags/:tagId',
    async (req, reply) => {
      const userId = await getUserId(req)
      await service.deactivateTag(req.params.tagId, userId)
      return reply.code(204).send()
    }
  )

  // POST /api/v1/nfc-payments/tap — Process a tap payment
  app.post('/tap', async (req: FastifyRequest, reply: FastifyReply) => {
    const senderId = await getUserId(req)
    const body = ProcessTapSchema.parse(req.body)

    if (!body.nfcUid && !body.tagId) {
      return reply.code(400).send({ error: 'Either nfcUid or tagId is required' })
    }

    // If only nfcUid provided, resolve it to get tagId + receiverId
    let receiverId = body.receiverId
    let tagId = body.tagId

    if (body.nfcUid && !tagId) {
      const tag = await service.resolveTagByUID(body.nfcUid)
      tagId = tag.id
      if (!receiverId) receiverId = tag.ownerId
    }

    const tap = await service.processTap({
      senderId,
      nfcUid: body.nfcUid,
      tagId,
      receiverId,
      amount: body.amount,
      currency: body.currency,
    })

    return reply.code(201).send({ data: tap })
  })

  // POST /api/v1/nfc-payments/sync-offline — Sync queued offline taps
  app.post('/sync-offline', async (req: FastifyRequest, reply: FastifyReply) => {
    const senderId = await getUserId(req)
    const body = SyncOfflineSchema.parse(req.body)

    // Attach senderId to each tap
    const tapsWithSender = body.taps.map(t => ({ ...t, senderId }))
    const result = await service.syncOfflineQueue(tapsWithSender)

    return reply.send({
      data: {
        syncedCount: result.synced.length,
        failedCount: result.failed.length,
        synced: result.synced,
        failed: result.failed,
      },
    })
  })
}
