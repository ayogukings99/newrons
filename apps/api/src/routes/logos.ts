/**
 * LOGOS Layer routes — Pillar 2
 *
 * Mount at: /logos
 *
 * Nodes:
 *   POST   /nodes                  — create node
 *   GET    /nodes                  — list public nodes (paginated + filtered)
 *   GET    /nodes/mine             — my nodes
 *   GET    /nodes/:nodeId          — get single node
 *   PATCH  /nodes/:nodeId          — update node
 *   DELETE /nodes/:nodeId          — delete node
 *   POST   /nodes/:nodeId/verify   — submit verification verdict
 *
 * Graphs:
 *   POST   /graphs                 — create graph
 *   GET    /graphs/:graphId        — get graph + nodes + edges
 *   POST   /graphs/:graphId/edges  — add edge between nodes
 *   POST   /graphs/:graphId/fork   — fork a public graph
 *
 * Knowledge:
 *   POST   /search                 — semantic search across LOGOS nodes
 *   POST   /synthesize             — RAG synthesis: question → cited answer
 */

import { FastifyInstance } from 'fastify'
import { logosService, ContentType, RelType, Verdict } from '../services/logos.service'
import { requireAuth } from '../middleware/auth'

export async function logosRoutes(app: FastifyInstance) {

  // ── Nodes ─────────────────────────────────────────────────────────────────

  app.post('/nodes', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const {
      title, content, contentType, languageCode,
      isPublic = true, sourceUrl, tags,
    } = req.body as {
      title: string; content: string; contentType: ContentType
      languageCode: string; isPublic?: boolean; sourceUrl?: string; tags?: string[]
    }

    if (!title?.trim())   return reply.code(400).send({ error: 'title required' })
    if (!content?.trim()) return reply.code(400).send({ error: 'content required' })
    if (!contentType)     return reply.code(400).send({ error: 'contentType required' })
    if (!languageCode)    return reply.code(400).send({ error: 'languageCode required' })

    try {
      const result = await logosService.createNode({
        creatorId: userId, title, content, contentType,
        languageCode, isPublic, sourceUrl, tags,
      })
      return reply.code(201).send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/nodes', async (req, reply) => {
    const { limit = '20', offset = '0', languageCode, contentType, tag } = req.query as Record<string, string>
    try {
      const nodes = await logosService.listPublicNodes({
        limit:        parseInt(limit),
        offset:       parseInt(offset),
        languageCode,
        contentType:  contentType as ContentType | undefined,
        tag,
      })
      return reply.send(nodes)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/nodes/mine', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { limit = '20', offset = '0' } = req.query as Record<string, string>
    try {
      const nodes = await logosService.myNodes(userId, { limit: parseInt(limit), offset: parseInt(offset) })
      return reply.send(nodes)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/nodes/:nodeId', async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const userId = (req.user as { sub: string }).sub as string | undefined
    try {
      const node = await logosService.getNode(nodeId, userId)
      return reply.send(node)
    } catch (err: any) {
      return reply.code(err.message === 'Access denied' ? 403 : 404).send({ error: err.message })
    }
  })

  app.patch('/nodes/:nodeId', { preHandler: requireAuth }, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const userId     = (req.user as { sub: string }).sub as string
    const updates    = req.body as { title?: string; content?: string; isPublic?: boolean; tags?: string[] }
    try {
      await logosService.updateNode(nodeId, userId, updates)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(err.message === 'Access denied' ? 403 : 500).send({ error: err.message })
    }
  })

  app.delete('/nodes/:nodeId', { preHandler: requireAuth }, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const userId     = (req.user as { sub: string }).sub as string
    try {
      await logosService.deleteNode(nodeId, userId)
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(err.message === 'Access denied' ? 403 : 500).send({ error: err.message })
    }
  })

  app.post('/nodes/:nodeId/verify', { preHandler: requireAuth }, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const userId     = (req.user as { sub: string }).sub as string
    const { verdict, reason } = req.body as { verdict: Verdict; reason: string }

    if (!verdict) return reply.code(400).send({ error: 'verdict required' })

    try {
      await logosService.submitVerification(nodeId, userId, verdict, reason ?? '')
      return reply.send({ ok: true })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Graphs ────────────────────────────────────────────────────────────────

  app.post('/graphs', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const {
      title, description, nodeIds = [], isPublic = true, isProtocol = false,
    } = req.body as {
      title: string; description: string; nodeIds?: string[]
      isPublic?: boolean; isProtocol?: boolean
    }

    if (!title?.trim()) return reply.code(400).send({ error: 'title required' })

    try {
      const graphId = await logosService.createGraph({
        creatorId: userId, title, description, nodeIds, isPublic, isProtocol,
      })
      return reply.code(201).send({ graphId })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/graphs/:graphId', async (req, reply) => {
    const { graphId } = req.params as { graphId: string }
    const userId = (req.user as { sub: string }).sub as string | undefined
    try {
      const graph = await logosService.getGraph(graphId, userId)
      return reply.send(graph)
    } catch (err: any) {
      return reply.code(err.message === 'Access denied' ? 403 : 404).send({ error: err.message })
    }
  })

  app.post('/graphs/:graphId/edges', { preHandler: requireAuth }, async (req, reply) => {
    const { graphId } = req.params as { graphId: string }
    const userId = (req.user as { sub: string }).sub as string
    const { fromNodeId, toNodeId, relationship, weight = 1.0 } = req.body as {
      fromNodeId: string; toNodeId: string; relationship: RelType; weight?: number
    }

    if (!fromNodeId || !toNodeId || !relationship) {
      return reply.code(400).send({ error: 'fromNodeId, toNodeId, relationship required' })
    }

    try {
      await logosService.addEdge(graphId, userId, fromNodeId, toNodeId, relationship, weight)
      return reply.code(201).send({ ok: true })
    } catch (err: any) {
      return reply.code(err.message === 'Access denied' ? 403 : 500).send({ error: err.message })
    }
  })

  app.post('/graphs/:graphId/fork', { preHandler: requireAuth }, async (req, reply) => {
    const { graphId } = req.params as { graphId: string }
    const userId = (req.user as { sub: string }).sub as string
    try {
      const forkedId = await logosService.forkGraph(graphId, userId)
      return reply.code(201).send({ graphId: forkedId })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ── Knowledge endpoints ───────────────────────────────────────────────────

  app.post('/search', async (req, reply) => {
    const {
      query, languageCode = 'en', limit = 10,
      contentType, verifiedOnly = false,
    } = req.body as {
      query: string; languageCode?: string; limit?: number
      contentType?: ContentType; verifiedOnly?: boolean
    }

    if (!query?.trim()) return reply.code(400).send({ error: 'query required' })

    try {
      const results = await logosService.semanticSearch({
        query, languageCode, limit, contentType, verifiedOnly,
      })
      return reply.send({ results })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.post('/synthesize', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const { question, languageCode = 'en', topK = 8 } = req.body as {
      question: string; languageCode?: string; topK?: number
    }

    if (!question?.trim()) return reply.code(400).send({ error: 'question required' })

    try {
      const result = await logosService.synthesize({ question, languageCode, topK, userId })
      return reply.send(result)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
