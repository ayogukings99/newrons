import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { createRateLimit } from '../middleware/auth'
import { requireNodeAuth } from '../middleware/node-auth'
import { RhythmicEscrowService } from '../services/rhythmic-escrow.service'
import { RhythmicFaceService } from '../services/rhythmic-face.service'
import { FACE_THRESHOLD_NXT } from '../services/rhythmic-escrow.logic'

// Rhythmic OS Phase-1 routes (VS1 sovereign entry + VS2 escrow/credit/tap).
// Testnet only. Value moves via process_wallet_transfer in NXT-reserve mode;
// the Anchor program (contracts/escrow) takes over settlement in VS3.

const service = new RhythmicEscrowService()

const DidSchema = z.string().regex(/^did:scn:[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid did:scn DID')

const ChallengeSchema = z.object({ did: DidSchema })
const VerifySchema = z.object({
  did: DidSchema,
  sig: z.string().min(16, 'Missing signature'),
  nonce: z.string().uuid(),
})
const GhostSchema = z.object({ did: DidSchema, ghost: z.boolean() })
const SignalSchema = z.object({
  did: DidSchema,
  kind: z.enum(['status', 'need', 'offer']),
  text: z.string().min(1).max(280),
  lang: z.enum(['yo', 'ig', 'ha', 'pcm', 'sw', 'en']).default('en'),
  ghost: z.boolean().default(false),
})
const EscrowCreateSchema = z.object({
  counterparty: DidSchema,
  amountNXT: z.number().positive().max(1_000_000),
  kind: z.enum(['escrow_dual', 'escrow_liveproof', 'asset_sale', 'timed_attendance']).default('escrow_dual'),
})
const ReleaseSchema = z.object({
  liveProofHash: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Must be 32-byte hex').optional(),
})
const TapQuoteSchema = z.object({
  to: DidSchema,
  amountNXT: z.number().positive().max(1_000_000),
})
const TapSubmitSchema = TapQuoteSchema.extend({
  faceAssertionId: z.string().min(8).optional(),
  idempotencyKey: z.string().uuid().optional(),
  offlineCreatedAt: z.string().datetime().optional(),
})
const FaceEnrollSchema = z.object({
  templateHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  consent: z.literal(true, { errorMap: () => ({ message: 'Explicit consent required' }) }),
})
const FaceVerifySchema = z.object({
  templateHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
})
const OfflineSyncSchema = z.object({
  taps: z.array(z.object({
    to: DidSchema,
    amountNXT: z.number().positive().max(1_000_000),
    faceAssertionId: z.string().min(8).optional(),
    idempotencyKey: z.string().uuid(),
    offlineCreatedAt: z.string().datetime(),
  })).max(50),
})

// In-memory nonce store (single-instance dev; move to Redis before production).
const nonces = new Map<string, { did: string; expiresAt: number }>()

function callerDid(req: FastifyRequest): string {
  const did = req.node?.did
  if (!did) throw new Error('No sovereign DID on this credential — register a node first')
  return did
}

export default async function rhythmicRoutes(app: FastifyInstance) {
  app.addHook('preHandler', createRateLimit(60, 60_000))

  // POST /api/v1/rhythmic/challenge — issue a DID-ownership nonce
  app.post('/challenge', async (req: FastifyRequest, reply: FastifyReply) => {
    const { did } = ChallengeSchema.parse(req.body)
    const nonce = crypto.randomUUID()
    nonces.set(nonce, { did, expiresAt: Date.now() + 5 * 60_000 })
    return reply.send({ data: { did, nonce, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), testnet: true } })
  })

  // POST /api/v1/rhythmic/verify — verify DID signature, mint capability token
  app.post('/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    const { did, sig, nonce } = VerifySchema.parse(req.body)
    const entry = nonces.get(nonce)
    if (!entry || entry.did !== did || Date.now() > entry.expiresAt) {
      return reply.code(401).send({ error: 'Stale or unknown challenge — request a new nonce' })
    }
    nonces.delete(nonce)
    // TODO(VS3): real ed25519 verify of `sig` over nonce with the DID pubkey.
    void sig
    const token = app.jwt.sign({ sub: did }, { expiresIn: '5m' })
    return reply.send({ data: { did, capabilityToken: token, testnet: true } })
  })

  // GET /api/v1/rhythmic/credit/me — soulbound score + event history
  app.get('/credit/me', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({ data: { ...(await service.creditView(callerDid(req))), soulbound: true, testnet: true } })
    } catch (err) {
      // Pre-migration 014 fallback: base score, empty history.
      return reply.send({ data: { did: callerDid(req), score: 50, history: [], soulbound: true, testnet: true, migrated: false } })
    }
  })

  // POST /api/v1/rhythmic/escrow/create — lock (Phase-1 kinds only)
  app.post('/escrow/create', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = EscrowCreateSchema.parse(req.body)
    if (body.kind === 'asset_sale' || body.kind === 'timed_attendance') {
      return reply.code(409).send({
        error: 'Settlement kind reserved for Phase 4 (brush packs / live classes). Interface frozen, execution not yet enabled.',
      })
    }
    try {
      const esc = await service.create({
        payerDid: callerDid(req),
        counterpartyDid: body.counterparty,
        amountNxt: body.amountNXT,
        kind: body.kind,
      })
      return reply.code(201).send({ data: { ...esc, chain: 'solana-devnet', testnet: true } })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // GET /api/v1/rhythmic/escrow/:id — fetch one (party-only readout comes with authz in VS3)
  app.get<{ Params: { id: string } }>('/escrow/:id', { preHandler: requireNodeAuth }, async (req, reply) => {
    try {
      return reply.send({ data: { ...(await service.get(req.params.id)), testnet: true } })
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message })
    }
  })

  // POST /api/v1/rhythmic/escrow/:id/accept — counterparty accepts
  app.post<{ Params: { id: string } }>('/escrow/:id/accept', { preHandler: requireNodeAuth }, async (req, reply) => {
    try {
      return reply.send({ data: { ...(await service.accept(req.params.id, callerDid(req))), testnet: true } })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // POST /api/v1/rhythmic/escrow/:id/release — payer co-sign (dual) or live proof
  app.post<{ Params: { id: string } }>('/escrow/:id/release', { preHandler: requireNodeAuth }, async (req, reply) => {
    const body = ReleaseSchema.parse(req.body ?? {})
    try {
      const esc = await service.release(req.params.id, callerDid(req), body.liveProofHash)
      return reply.send({ data: { ...esc, testnet: true } })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // POST /api/v1/rhythmic/escrow/:id/reverse — payer after expiry, or counterparty refusal
  app.post<{ Params: { id: string } }>('/escrow/:id/reverse', { preHandler: requireNodeAuth }, async (req, reply) => {
    try {
      return reply.send({ data: { ...(await service.reverse(req.params.id, callerDid(req))), testnet: true } })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // POST /api/v1/rhythmic/face/enroll — store template HASH with consent (never images)
  app.post('/face/enroll', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = FaceEnrollSchema.parse(req.body)
    try {
      await new RhythmicFaceService().enroll(callerDid(req), body.templateHash, body.consent)
      return reply.code(201).send({ data: { enrolled: true, testnet: true } })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // POST /api/v1/rhythmic/face/verify — mint a 2-minute single-use assertion
  app.post('/face/verify', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = FaceVerifySchema.parse(req.body)
    try {
      const a = await new RhythmicFaceService().verify(callerDid(req), body.templateHash)
      return reply.send({ data: { ...a, testnet: true } })
    } catch (err) {
      return reply.code(401).send({ error: (err as Error).message })
    }
  })

  // POST /api/v1/rhythmic/tap/quote — price a tap (face gate at FACE_THRESHOLD_NXT)
  app.post('/tap/quote', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = TapQuoteSchema.parse(req.body)
    return reply.send({
      data: {
        to: body.to, amountNXT: body.amountNXT,
        requiresFace: body.amountNXT >= FACE_THRESHOLD_NXT,
        faceThresholdNXT: FACE_THRESHOLD_NXT,
        expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(),
        testnet: true,
      },
    })
  })

  // POST /api/v1/rhythmic/tap/submit — instant NXT transfer, face-gated over threshold
  app.post('/tap/submit', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = TapSubmitSchema.parse(req.body)
    try {
      return reply.send({
        data: {
          ...(await service.tapTransfer({
            senderDid: callerDid(req),
            receiverDid: body.to,
            amountNxt: body.amountNXT,
            faceAssertionId: body.faceAssertionId,
            idempotencyKey: body.idempotencyKey,
            offlineCreatedAt: body.offlineCreatedAt,
          })),
          testnet: true,
        },
      })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // POST /api/v1/rhythmic/tap/sync-offline — settle queued offline taps (max 50, idempotent)
  app.post('/tap/sync-offline', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = OfflineSyncSchema.parse(req.body)
    const senderDid = callerDid(req)
    const results = []
    for (const tap of body.taps) {
      try {
        const r = await service.tapTransfer({
          senderDid,
          receiverDid: tap.to,
          amountNxt: tap.amountNXT,
          faceAssertionId: tap.faceAssertionId,
          idempotencyKey: tap.idempotencyKey,
          offlineCreatedAt: tap.offlineCreatedAt,
        })
        results.push({ key: tap.idempotencyKey, ok: true, duplicate: r.duplicate })
      } catch (err) {
        results.push({ key: tap.idempotencyKey, ok: false, error: (err as Error).message })
      }
    }
    return reply.send({ data: { results, testnet: true } })
  })

  // GET /api/v1/rhythmic/mirror — Ghost-safe aggregates only (no DIDs, no per-node data)
  app.get('/mirror', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({ data: { ...(await service.mirrorStats()), testnet: true } })
    } catch {
      return reply.send({
        data: { escrows: {}, creditAvg: 50, creditNodes: 0, taps: 0, tapVolumeNxt: 0, migrated: false, testnet: true },
      })
    }
  })

  // POST /api/v1/rhythmic/ghost/toggle — one-tap presence kill-switch
  app.post('/ghost/toggle', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { ghost } = GhostSchema.parse(req.body)
    return reply.send({ data: { ghost, testnet: true } })
  })

  // POST /api/v1/rhythmic/signals/publish — ghost-gated (safety passes through)
  app.post('/signals/publish', { preHandler: requireNodeAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const signal = SignalSchema.parse(req.body)
    if (signal.ghost) {
      return reply.code(403).send({ error: 'Ghost Mode blocks non-essential signals' })
    }
    return reply.send({ data: { ok: true, at: new Date().toISOString(), testnet: true } })
  })
}
