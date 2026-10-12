import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { requireAuth, createRateLimit } from '../middleware/auth'

// Rhythmic OS Phase-1 bridge (VS1 sovereign entry + VS2 escrow stubs).
// Testnet only. No mainnet value. Every handler is labelled testnet in responses.
// Full escrow execution lands in VS2 against Solana devnet; these stubs freeze
// the interface now so apps/app can build against it without rework.

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
  fiatMemo: z.object({ amount: z.number().positive(), currency: z.string().length(3) }).optional(),
})

// In-memory nonce store (single-instance dev; move to Redis before production).
const nonces = new Map<string, { did: string; expiresAt: number }>()

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
    // TODO(VS2): real ed25519 verify of `sig` over nonce with the DID pubkey
    // (via @solana/web3.js ed25519 / nacl). VS1 accepts format-valid sigs only.
    void sig
    const token = app.jwt.sign(
      { sub: did, scopes: ['escrow:create', 'escrow:accept', 'escrow:release', 'transfer:submit', 'signals:publish'] },
      { expiresIn: '5m' },
    )
    return reply.send({ data: { did, capabilityToken: token, testnet: true } })
  })

  // GET /api/v1/rhythmic/credit/me — soulbound score view (skeleton)
  app.get('/credit/me', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const did = (req.user as { sub: string }).sub
    // TODO(VS2): resolve did:scn -> users(id) via identity-bridge, read
    // verifiable credit events; mint only through protocol-signed CreditEvent.
    return reply.send({ data: { did, score: 50, history: [], soulbound: true, testnet: true } })
  })

  // POST /api/v1/rhythmic/escrow/create — Phase-1 kinds only; v1.4 kinds rejected with upgrade path
  app.post('/escrow/create', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const payer = (req.user as { sub: string }).sub
    const body = EscrowCreateSchema.parse(req.body)
    if (body.kind === 'asset_sale' || body.kind === 'timed_attendance') {
      return reply.code(409).send({
        error: 'Settlement kind reserved for Phase 4 (brush packs / live classes). Interface frozen, execution not yet enabled.',
      })
    }
    // TODO(VS2): Anchor PDA initialize on solana-devnet + persist via settlement-bridge pattern.
    return reply.code(201).send({
      data: {
        id: `esc_test_${Date.now()}`,
        pda: 'TESTNET-PENDING',
        chain: 'solana-devnet',
        payer,
        counterparty: body.counterparty,
        amountNXT: body.amountNXT,
        fiatMemo: body.fiatMemo,
        kind: body.kind,
        state: 'locked',
        expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
        testnet: true,
      },
    })
  })

  // POST /api/v1/rhythmic/ghost/toggle — one-tap presence kill-switch
  app.post('/ghost/toggle', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { ghost } = GhostSchema.parse(req.body)
    // TODO(VS1-final): persist to users(id) metadata; publish presence revocation.
    return reply.send({ data: { ghost, testnet: true } })
  })

  // POST /api/v1/rhythmic/signals/publish — ghost-gated (safety passes through)
  app.post('/signals/publish', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const signal = SignalSchema.parse(req.body)
    if (signal.ghost && signal.kind !== 'status') {
      return reply.code(403).send({ error: 'Ghost Mode blocks non-essential signals' })
    }
    // TODO(Phase 2): differential-privacy aggregation + LOGOS pipeline (see logos-signal-extractor job).
    return reply.send({ data: { ok: true, at: new Date().toISOString(), testnet: true } })
  })
}
