/**
 * Integration Identity Routes
 *
 * Fastify routes for the identity bridge:
 * - POST /integration/identity — register/update node identity
 * - GET /integration/identity/me — get caller's node identity
 * - GET /integration/identity/resolve/:did — resolve DID → public info
 * - POST /integration/identity/verify — prove DID ownership via signature
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { identityBridgeService } from '../../services/integration/identity-bridge.service'

// ── Schemas ────────────────────────────────────────────────────────────────

const RegisterIdentitySchema = z.object({
  did: z.string().min(10).max(200),       // did:scn:<base58-pubkey>
  publicKeyHex: z.string().min(64).max(64), // ed25519 public key (32 bytes hex)
  encryptedSecret: z.string().min(20),    // base64 encrypted private key
  nodeType: z.enum(['member', 'operator', 'auditor']).default('member'),
})

const VerifySignatureSchema = z.object({
  did: z.string().min(10).max(200),
  challenge: z.string().min(10),          // nonce to sign
  signature: z.string().min(20),          // base64 signature
})

// ── Route Helper: Extract userId from JWT ──────────────────────────────────

async function getUserId(req: FastifyRequest): Promise<number> {
  await req.jwtVerify()
  const payload = req.user as { sub: string }
  if (!payload.sub) throw new Error('Invalid JWT: no sub claim')
  const userId = parseInt(payload.sub, 10)
  if (!userId) throw new Error('Invalid JWT: sub is not a valid user ID')
  return userId
}

// ── Routes ─────────────────────────────────────────────────────────────────

export default async function identityRoutes(app: FastifyInstance) {
  /**
   * POST /integration/identity
   *
   * Register or update a user's node identity.
   * Creates node_identities record if new; updates last_seen_at if existing.
   *
   * Body:
   *   {
   *     "did": "did:scn:...",
   *     "publicKeyHex": "...",
   *     "encryptedSecret": "...",
   *     "nodeType": "member" (optional)
   *   }
   *
   * Returns: { data: NodeIdentity }
   */
  app.post<{ Body: z.infer<typeof RegisterIdentitySchema> }>(
    '/',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = await getUserId(req)
        const body = RegisterIdentitySchema.parse(req.body)

        const identity = await identityBridgeService.getOrCreateIdentity(userId, {
          did: body.did,
          publicKeyHex: body.publicKeyHex,
          encryptedSecret: body.encryptedSecret,
          nodeType: body.nodeType,
        })

        return reply.code(201).send({ data: identity })
      } catch (err: any) {
        app.log.error(err)
        if (err instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'Validation failed',
            details: err.errors,
          })
        }
        return reply.code(500).send({
          error: 'Failed to register identity',
          message: err.message,
        })
      }
    }
  )

  /**
   * GET /integration/identity/me
   *
   * Get the authenticated user's own node identity (including encrypted secret).
   * Requires JWT auth.
   *
   * Returns: { data: NodeIdentity | null }
   */
  app.get<{ Reply: { data: any | null } }>(
    '/me',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = await getUserId(req)
        const identity = await identityBridgeService.getUserNodeIdentity(userId)

        return reply.send({ data: identity })
      } catch (err: any) {
        app.log.error(err)
        return reply.code(500).send({
          error: 'Failed to fetch identity',
          message: err.message,
        })
      }
    }
  )

  /**
   * GET /integration/identity/resolve/:did
   *
   * Resolve a DID to public node info (no secrets, no user_id).
   * Publicly callable (no auth required).
   * Useful for looking up peer identities in supply chain contexts.
   *
   * Params:
   *   did: string — the DID to resolve
   *
   * Returns: { data: NodeInfo | null }
   */
  app.get<{ Params: { did: string } }>(
    '/resolve/:did',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { did } = req.params
        const nodeInfo = await identityBridgeService.getPublicNodeInfo(did)

        return reply.send({ data: nodeInfo })
      } catch (err: any) {
        app.log.error(err)
        return reply.code(500).send({
          error: 'Failed to resolve DID',
          message: err.message,
        })
      }
    }
  )

  /**
   * POST /integration/identity/verify
   *
   * Verify DID ownership via cryptographic signature.
   * Client signs a challenge (nonce) with their private key; we verify against stored public key.
   *
   * Body:
   *   {
   *     "did": "did:scn:...",
   *     "challenge": "some-random-nonce",
   *     "signature": "base64-encoded-signature"
   *   }
   *
   * Returns: { verified: boolean }
   */
  app.post<{ Body: z.infer<typeof VerifySignatureSchema> }>(
    '/verify',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = await getUserId(req)
        const body = VerifySignatureSchema.parse(req.body)

        const verified = await identityBridgeService.verifyDIDSignature(
          userId,
          body.did,
          body.challenge,
          body.signature
        )

        return reply.send({ verified })
      } catch (err: any) {
        app.log.error(err)
        if (err instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'Validation failed',
            details: err.errors,
          })
        }
        return reply.code(500).send({
          error: 'Signature verification failed',
          message: err.message,
        })
      }
    }
  )

  /**
   * GET /integration/identity/batch-resolve
   *
   * Batch resolve multiple DIDs to their public info.
   * Query param: ?dids=did1,did2,did3
   *
   * Returns: { data: (NodeInfo | null)[] }
   */
  app.get<{ Querystring: { dids: string } }>(
    '/batch-resolve',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { dids } = req.query
        if (!dids) {
          return reply.code(400).send({
            error: 'Missing dids query parameter',
          })
        }

        const didList = dids.split(',').filter((d) => d.trim().length > 0)
        const nodeInfos = await identityBridgeService.listPeerIdentities(didList)

        return reply.send({ data: nodeInfos })
      } catch (err: any) {
        app.log.error(err)
        return reply.code(500).send({
          error: 'Batch resolve failed',
          message: err.message,
        })
      }
    }
  )
}
