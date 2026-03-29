/**
 * Warehouse NFC Routes
 *
 * Endpoints:
 *   POST   /integration/warehouse/register-tag
 *   POST   /integration/warehouse/scan
 *   GET    /integration/warehouse/bin/:nfcUid
 *   POST   /integration/warehouse/goods-receipt
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { WarehouseNFCService } from '../../services/integration/warehouse-nfc.service'

const service = new WarehouseNFCService()

// ── Schemas ────────────────────────────────────────────────────

const RegisterWarehouseTagSchema = z.object({
  label: z.string().min(1).max(100),
  nfcUid: z.string().optional(),
  binId: z.string().min(1),
  tagType: z.enum(['bin', 'pallet', 'asset', 'location']),
  locationId: z.string().optional(),
})

const ProcessWarehouseScanSchema = z.object({
  nfcUid: z.string().min(1),
  actionHint: z.enum(['task_complete', 'goods_receipt', 'bin_lookup', 'transfer']).optional(),
  qty: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
})

const GoodsReceiptScanSchema = z.object({
  nfcUid: z.string().min(1),
  poId: z.string().min(1),
  skuId: z.string().min(1),
  qty: z.number().positive(),
})

// ── Route helper: get userId from JWT ─────────────────────────

async function getUserId(req: FastifyRequest): Promise<number> {
  await req.jwtVerify()
  const payload = req.user as { sub: string }
  return Number(payload.sub)
}

// ── Routes ────────────────────────────────────────────────────

export default async function warehouseNfcRoutes(app: FastifyInstance) {
  /**
   * POST /integration/warehouse/register-tag
   * Register a new warehouse NFC tag (admin/operator only).
   */
  app.post('/register-tag', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = RegisterWarehouseTagSchema.parse(req.body)

    const tag = await service.registerWarehouseTag({
      ownerId: String(userId),
      ...body,
    })

    return reply.code(201).send({ data: tag })
  })

  /**
   * POST /integration/warehouse/scan
   * Process a warehouse NFC scan event.
   * Determines action from context (current user's active task).
   */
  app.post('/scan', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = ProcessWarehouseScanSchema.parse(req.body)

    const result = await service.processWarehouseScan({
      userId,
      ...body,
    })

    return reply.send({ data: result })
  })

  /**
   * GET /integration/warehouse/bin/:nfcUid
   * Get bin info from NFC scan.
   * Returns bin ID, current contents, pending tasks.
   */
  app.get<{ Params: { nfcUid: string } }>(
    '/bin/:nfcUid',
    async (req, reply) => {
      const { nfcUid } = req.params

      const binInfo = await service.getBinInfoFromScan(nfcUid)

      return reply.send({ data: binInfo })
    }
  )

  /**
   * POST /integration/warehouse/goods-receipt
   * Record a goods receipt via NFC scan.
   * Links to pending PO receipt flow.
   */
  app.post('/goods-receipt', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserId(req)
    const body = GoodsReceiptScanSchema.parse(req.body)

    await service.recordGoodsReceiptScan({
      userId,
      ...body,
    })

    return reply.code(200).send({
      data: {
        message: `Goods receipt recorded for ${body.skuId}, qty: ${body.qty}`,
      },
    })
  })
}
