/**
 * LOGOS Public Knowledge Graph API Routes — Phase 5
 * Mount at: /logos/public
 *
 * Graph Registry (authenticated users):
 *   POST   /graphs                    — publish a graph to the public registry
 *   GET    /graphs                    — list all public graphs
 *   GET    /graphs/:graphId/analytics — get analytics (graph owner only)
 *   POST   /graphs/:graphId/rate      — rate a graph (1-5 stars)
 *
 * Public Graph Queries (API key authenticated — for external developers):
 *   GET    /graphs/:graphId/nodes/:nodeId   — query a node
 *   GET    /graphs/:graphId/path            — BFS path query
 *
 * Federation:
 *   GET    /federation                — list federated partner graphs
 *   POST   /federation               — register a federated graph (admin)
 */

import { FastifyInstance }  from 'fastify'
import { logosPublicService, GraphPricingModel } from '../services/logos-public.service'
import { developerService } from '../services/developer.service'
import { requireAuth } from '../middleware/auth'

export async function logosPublicRoutes(app: FastifyInstance) {

  // ── Graph Registry ─────────────────────────────────────────────────────────

  app.post('/graphs', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { graphId, name, description, languageCode, pricingModel, pricePerQueryNxt } = req.body as {
      graphId:           string
      name:              string
      description:       string
      languageCode?:     string
      pricingModel?:     GraphPricingModel
      pricePerQueryNxt?: number
    }

    if (!graphId)          return reply.code(400).send({ error: 'graphId required' })
    if (!name?.trim())     return reply.code(400).send({ error: 'name required' })
    if (!description?.trim()) return reply.code(400).send({ error: 'description required' })

    try {
      const graph = await logosPublicService.publishGraph({
        ownerId: userId, graphId, name, description,
        languageCode, pricingModel, pricePerQueryNxt,
      })
      return reply.code(201).send(graph)
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  app.get('/graphs', async (req, reply) => {
    const {
      languageCode, pricingModel, limit = '20',
      offset = '0', sortBy = 'popular',
    } = req.query as Record<string, string>

    try {
      const graphs = await logosPublicService.listPublicGraphs({
        languageCode,
        pricingModel:  pricingModel as GraphPricingModel | undefined,
        limit:         parseInt(limit),
        offset:        parseInt(offset),
        sortBy:        sortBy as 'popular' | 'recent' | 'rating',
      })
      return reply.send({ graphs })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/graphs/:graphId/analytics', { preHandler: requireAuth }, async (req, reply) => {
    const userId    = (req.user as { sub: string }).sub as string
    const { graphId } = req.params as { graphId: string }

    try {
      const analytics = await logosPublicService.getAnalytics(graphId, userId)
      return reply.send(analytics)
    } catch (err: any) {
      return reply.code(403).send({ error: err.message })
    }
  })

  app.post('/graphs/:graphId/rate', { preHandler: requireAuth }, async (req, reply) => {
    const userId    = (req.user as { sub: string }).sub as string
    const { graphId } = req.params as { graphId: string }
    const { stars, comment } = req.body as { stars: number; comment?: string }

    if (!stars) return reply.code(400).send({ error: 'stars required (1-5)' })

    try {
      await logosPublicService.rateGraph({ graphId, raterId: userId, stars, comment })
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Developer API Key Queries ──────────────────────────────────────────────

  /**
   * GET /graphs/:graphId/nodes/:nodeId
   * Authenticated with NEXUS API key (X-API-Key header), metered.
   */
  app.get('/graphs/:graphId/nodes/:nodeId', async (req, reply) => {
    const rawKey = (req.headers['x-api-key'] as string) ?? ''
    if (!rawKey) return reply.code(401).send({ error: 'X-API-Key header required' })

    const { graphId, nodeId } = req.params as { graphId: string; nodeId: string }

    try {
      const apiKey = await developerService.authenticateKey(rawKey, `/logos/public/graphs/${graphId}/nodes`)
      const node   = await logosPublicService.queryNode({
        graphId, nodeId,
        callerId: apiKey.accountId,
        keyId:    apiKey.id,
      })
      return reply.send(node)
    } catch (err: any) {
      const code = err.message.includes('quota') || err.message.includes('Rate limit') ? 429 : 401
      return reply.code(code).send({ error: err.message })
    }
  })

  /**
   * GET /graphs/:graphId/path?from=<id>&to=<id>
   * Authenticated with NEXUS API key (X-API-Key header), metered.
   */
  app.get('/graphs/:graphId/path', async (req, reply) => {
    const rawKey = (req.headers['x-api-key'] as string) ?? ''
    if (!rawKey) return reply.code(401).send({ error: 'X-API-Key header required' })

    const { graphId }    = req.params as { graphId: string }
    const { from, to }   = req.query  as { from?: string; to?: string }

    if (!from || !to) return reply.code(400).send({ error: 'from and to node IDs required' })

    try {
      const apiKey = await developerService.authenticateKey(rawKey, `/logos/public/graphs/${graphId}/path`)
      const path   = await logosPublicService.queryPath({
        graphId,
        fromNode: from,
        toNode:   to,
        callerId: apiKey.accountId,
        keyId:    apiKey.id,
      })
      if (!path) return reply.code(404).send({ error: 'No path found between these nodes' })
      return reply.send(path)
    } catch (err: any) {
      const code = err.message.includes('quota') || err.message.includes('Rate limit') ? 429
        : err.message.includes('not publicly') ? 404 : 401
      return reply.code(code).send({ error: err.message })
    }
  })

  // ── Federation ─────────────────────────────────────────────────────────────

  app.get('/federation', async (_req, reply) => {
    try {
      const graphs = await logosPublicService.listFederatedGraphs()
      return reply.send({ graphs })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.post('/federation', { preHandler: [requireAuth, app.requireAdmin] }, async (req, reply) => {
    const { institutionId, institutionName, graphId, graphName, endpointUrl, trustLevel } = req.body as {
      institutionId:   string
      institutionName: string
      graphId:         string
      graphName:       string
      endpointUrl:     string
      trustLevel?:     'full' | 'read-only' | 'query-only'
    }

    if (!institutionId || !graphId || !endpointUrl) {
      return reply.code(400).send({ error: 'institutionId, graphId, and endpointUrl required' })
    }

    try {
      await logosPublicService.registerFederation({
        institutionId, institutionName, graphId, graphName, endpointUrl, trustLevel,
      })
      return reply.code(201).send({ ok: true })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })
}
