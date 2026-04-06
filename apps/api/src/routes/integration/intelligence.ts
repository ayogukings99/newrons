/**
 * LOGOS Intelligence Routes
 * Mount at: /integration/intelligence
 *
 * Endpoints:
 *   GET  /demand-signals         — query demand signals for SKU/location
 *   GET  /supplier/:did          — supplier intelligence & reputation
 *   GET  /market/:locationCode   — market context from LOGOS community
 *   POST /extract                — trigger extraction job (admin only)
 *   POST /link                   — link LOGOS node to supply entity
 */

import { FastifyInstance } from 'fastify'
import { logosIntelligenceService } from '../../services/integration/logos-intelligence.service'

export default async function intelligenceRoutes(app: FastifyInstance) {

  /**
   * GET /demand-signals
   * Query demand signals with filters
   *
   * Query params:
   *   sku_keywords (required): comma-separated keywords (e.g., 'mango,fruit')
   *   location: ISO country/region code (optional)
   *   limit: max results (default: 20)
   *
   * Example: /demand-signals?sku_keywords=mango,fruit&location=NG&limit=20
   */
  app.get('/demand-signals', async (req, reply) => {
    const { sku_keywords, location, limit = '20' } = req.query as Record<string, string>

    if (!sku_keywords) {
      return reply.code(400).send({ error: 'sku_keywords query parameter required' })
    }

    try {
      const keywords = sku_keywords.split(',').map(k => k.trim()).filter(Boolean)
      const signals = await logosIntelligenceService.getDemandSignals({
        skuKeywords: keywords,
        locationCode: location,
        limit: parseInt(limit),
      })

      return reply.send({
        count: signals.length,
        signals,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /supplier/:did
   * Get supplier intelligence (reputation, sentiment, community score)
   *
   * Params:
   *   did: supplier DID (e.g., 'did:scn:XXXXXXXXX')
   *
   * Optional query:
   *   supplierName: human-readable name for search context
   *   industry: industry category (for context)
   */
  app.get('/supplier/:did', async (req, reply) => {
    const { did } = req.params as { did: string }
    const { supplierName, industry } = req.query as Record<string, string>

    if (!did) {
      return reply.code(400).send({ error: 'DID parameter required' })
    }

    try {
      const intelligence = await logosIntelligenceService.getSupplierIntelligence({
        supplierDid: did,
        supplierName,
        industry,
      })

      return reply.send(intelligence)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /market/:locationCode
   * Get market context for a location
   *
   * Params:
   *   locationCode: ISO country code (e.g., 'NG', 'KE', 'GH')
   *
   * Returns:
   *   - conditions: 'normal' | 'disrupted' | 'high_demand' | 'oversupply'
   *   - topCommodities: trending products with magnitude
   *   - alerts: critical market alerts
   */
  app.get('/market/:locationCode', async (req, reply) => {
    const { locationCode } = req.params as { locationCode: string }

    if (!locationCode) {
      return reply.code(400).send({ error: 'locationCode parameter required' })
    }

    try {
      const context = await logosIntelligenceService.getMarketContext(locationCode)
      return reply.send(context)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * POST /extract
   * Trigger demand signal extraction job
   *
   * Admin only. Processes recent LOGOS nodes and extracts supply chain signals.
   *
   * Request body (optional):
   *   graphIds: string[] — specific graph IDs to process
   *   since: ISO timestamp — only process nodes since this time
   *
   * Response:
   *   extractedCount: number of new signals extracted
   *   signals: DemandSignal[] — extracted signals
   */
  app.post('/extract', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string

    // TODO: Check if user is admin
    // For now, allow any authenticated user (should be restricted in production)

    const { graphIds, since } = req.body as {
      graphIds?: string[]
      since?: string
    } | undefined

    try {
      const signals = await logosIntelligenceService.extractDemandSignals({
        graphIds,
        since: since ? new Date(since) : undefined,
      })

      return reply.code(200).send({
        extractedCount: signals.length,
        signals,
        triggeredBy: userId,
        timestamp: new Date().toISOString(),
      })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * POST /link
   * Link a LOGOS node to a supply chain entity
   *
   * Auth required. Creates a logos_supply_links entry for transparency.
   *
   * Request body:
   *   logosNodeId: UUID — LOGOS node ID
   *   entityType: 'sku' | 'supplier' | 'route' | 'location'
   *   entityId: string — supply chain entity ID
   *   relevance: 0-1 (optional, default 0.5)
   */
  app.post('/link', { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req as any).userId as string

    const { logosNodeId, entityType, entityId, relevance } = req.body as {
      logosNodeId?: string
      entityType?: string
      entityId?: string
      relevance?: number
    } | undefined

    if (!logosNodeId) {
      return reply.code(400).send({ error: 'logosNodeId required' })
    }
    if (!entityType || !['sku', 'supplier', 'route', 'location'].includes(entityType)) {
      return reply.code(400).send({
        error: "entityType required, must be one of: 'sku', 'supplier', 'route', 'location'"
      })
    }
    if (!entityId) {
      return reply.code(400).send({ error: 'entityId required' })
    }

    try {
      await logosIntelligenceService.linkNodeToEntity({
        logosNodeId,
        entityType: entityType as 'sku' | 'supplier' | 'route' | 'location',
        entityId,
        relevance,
      })

      return reply.code(201).send({
        success: true,
        message: 'Link created successfully',
        logosNodeId,
        entityType,
        entityId,
        linkedBy: userId,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
