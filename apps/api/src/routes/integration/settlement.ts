/**
 * Settlement Bridge Routes
 * NXT settlement for supply chain Purchase Orders
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { settlementBridgeService } from '../../services/integration/settlement-bridge.service'

// ── Schemas ────────────────────────────────────────────────────────────

const ReserveSettlementSchema = z.object({
  poId: z.string().min(1),
  buyerDid: z.string().startsWith('did:scn:'),
  supplierDid: z.string().startsWith('did:scn:'),
  amountNxt: z.number().positive(),
})

const ExecuteSettlementSchema = z.object({
  // params only
})

const ReleaseSettlementSchema = z.object({
  // params only
})

// ── Helper: extract userId from JWT ────────────────────────────────────

async function getUserId(req: FastifyRequest): Promise<string> {
  await req.jwtVerify()
  const payload = req.user as { sub: string }
  return payload.sub
}

// ── Routes ─────────────────────────────────────────────────────────────

export default async function settlementRoutes(app: FastifyInstance) {
  /**
   * POST /integration/settlement/reserve
   *
   * Reserve NXT for a confirmed PO (escrow lock).
   * Called when PO transitions to CONFIRMED status.
   *
   * Body: { poId, buyerDid, supplierDid, amountNxt }
   * Returns: { data: PoSettlement }
   */
  app.post('/reserve', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await getUserId(req) // Require auth
      const body = ReserveSettlementSchema.parse(req.body)

      const settlement = await settlementBridgeService.reservePoSettlement(body)
      return reply.code(201).send({
        data: settlement,
        message: `NXT reserved for PO ${body.poId}`,
      })
    } catch (err: any) {
      return reply.code(400).send({
        error: err.message,
        code: 'RESERVE_FAILED',
      })
    }
  })

  /**
   * POST /integration/settlement/execute/:poId
   *
   * Execute settlement when goods are received.
   * Called when PO transitions to RECEIVED status.
   * Releases escrow → transfers NXT to supplier.
   *
   * Returns: { data: PoSettlement }
   */
  app.post<{ Params: { poId: string } }>(
    '/execute/:poId',
    async (req, reply) => {
      try {
        await getUserId(req) // Require auth
        const { poId } = req.params

        const settlement = await settlementBridgeService.executePoSettlement(poId)
        return reply.code(200).send({
          data: settlement,
          message: `Settlement executed for PO ${poId}`,
        })
      } catch (err: any) {
        return reply.code(400).send({
          error: err.message,
          code: 'EXECUTE_FAILED',
        })
      }
    }
  )

  /**
   * POST /integration/settlement/release/:poId
   *
   * Release escrow if PO is cancelled.
   * Called when PO transitions to CANCELLED status.
   * Returns reserved NXT to buyer's available balance.
   *
   * Returns: { message: "Settlement released" }
   */
  app.post<{ Params: { poId: string } }>(
    '/release/:poId',
    async (req, reply) => {
      try {
        await getUserId(req) // Require auth
        const { poId } = req.params

        await settlementBridgeService.releasePoSettlement(poId)
        return reply.code(200).send({
          message: `Settlement released for PO ${poId}`,
        })
      } catch (err: any) {
        return reply.code(400).send({
          error: err.message,
          code: 'RELEASE_FAILED',
        })
      }
    }
  )

  /**
   * GET /integration/settlement/po/:poId
   *
   * Get settlement status for a PO.
   *
   * Returns: { data: PoSettlement | null }
   */
  app.get<{ Params: { poId: string } }>(
    '/po/:poId',
    async (req, reply) => {
      try {
        await getUserId(req) // Require auth
        const { poId } = req.params

        const settlement = await settlementBridgeService.getSettlementStatus(poId)
        return reply.send({
          data: settlement,
        })
      } catch (err: any) {
        return reply.code(400).send({
          error: err.message,
          code: 'FETCH_FAILED',
        })
      }
    }
  )

  /**
   * GET /integration/settlement/history
   *
   * Get settlement history for authenticated user's DIDs.
   * Returns paginated list of settlements (as buyer or supplier).
   *
   * Query params:
   *   - limit: number (default: 50, max: 500)
   *   - offset: number (default: 0)
   *
   * Returns: { data: SettlementHistoryItem[], pagination: { limit, offset, hasMore } }
   */
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/history',
    async (req, reply) => {
      try {
        const userId = await getUserId(req)

        // For now, use userId as DID proxy (in real app, fetch user's node_identities)
        const limit = Math.min(parseInt(req.query.limit || '50'), 500)
        const offset = parseInt(req.query.offset || '0')

        // TODO: In production, fetch user's actual DID from node_identities table
        // For now, we'll return an error indicating the user needs to establish a DID first
        const { data: nodeIdentity } = await (
          await import('../../lib/supabase')
        ).supabaseAdmin
          .from('node_identities')
          .select('did')
          .eq('user_id', userId)
          .maybeSingle()

        if (!nodeIdentity) {
          return reply.code(400).send({
            error: 'User does not have an established node identity (DID)',
            code: 'NO_DID',
          })
        }

        const settlements = await settlementBridgeService.getSettlementHistory(
          nodeIdentity.did,
          limit,
          offset
        )

        return reply.send({
          data: settlements,
          pagination: {
            limit,
            offset,
            hasMore: settlements.length === limit,
          },
        })
      } catch (err: any) {
        return reply.code(400).send({
          error: err.message,
          code: 'HISTORY_FETCH_FAILED',
        })
      }
    }
  )
}
