/**
 * LOGOS v2 Routes — Phase 3/4 Extended Capabilities
 * Mount at: /logos/v2
 *
 * Graph Traversal:
 *   GET  /graphs/:graphId/path          — BFS shortest path between two nodes
 *
 * Protocols:
 *   POST /protocols                     — create a reusable knowledge protocol
 *   GET  /protocols                     — list public protocols
 *   GET  /protocols/:protocolId         — get protocol with steps
 *
 * Ambient AI:
 *   POST /ambient                       — get ambient knowledge suggestions for current context
 *
 * Cross-Graph Synthesis:
 *   POST /synthesize                    — synthesize knowledge across multiple public graphs
 *
 * Knowledge Gap Detection:
 *   GET  /kb/:kbId/gaps                 — detect knowledge gaps in a knowledge base
 *
 * Contradiction Detection:
 *   GET  /graphs/:graphId/contradictions — detect contradicting nodes in a graph
 */

import { FastifyInstance } from 'fastify'
import { logosV2Service } from '../services/logos-v2.service'
import { requireAuth } from '../middleware/auth'

export async function logosV2Routes(app: FastifyInstance) {

  // ── Graph Traversal ────────────────────────────────────────────────────────

  /**
   * GET /graphs/:graphId/path?from=<nodeId>&to=<nodeId>
   * Returns shortest BFS path between two nodes with Claude-generated reasoning.
   */
  app.get('/graphs/:graphId/path', async (req, reply) => {
    const { graphId } = req.params as { graphId: string }
    const { from, to }  = req.query  as { from?: string; to?: string }

    if (!from) return reply.code(400).send({ error: '"from" node id required' })
    if (!to)   return reply.code(400).send({ error: '"to" node id required' })
    if (from === to) return reply.code(400).send({ error: 'from and to must be different nodes' })

    try {
      const path = await logosV2Service.findPath(graphId, from, to)
      if (!path) return reply.code(404).send({ error: 'No path found between these nodes' })
      return reply.send(path)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Protocols ──────────────────────────────────────────────────────────────

  /**
   * POST /protocols
   * Body: { graphId, title, description, triggerNodeId, isPublic?, languageCode? }
   */
  app.post('/protocols', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub as string
    const {
      graphId, title, description, triggerNodeId, isPublic = false, languageCode = 'en',
    } = req.body as {
      graphId:       string
      title:         string
      description:   string
      triggerNodeId: string
      isPublic?:     boolean
      languageCode?: string
    }

    if (!graphId)       return reply.code(400).send({ error: 'graphId required' })
    if (!title?.trim()) return reply.code(400).send({ error: 'title required' })
    if (!description?.trim()) return reply.code(400).send({ error: 'description required' })
    if (!triggerNodeId) return reply.code(400).send({ error: 'triggerNodeId required' })

    try {
      const protocolId = await logosV2Service.createProtocol({
        creatorId: userId, graphId, title, description, triggerNodeId, isPublic, languageCode,
      })
      return reply.code(201).send({ protocolId })
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /protocols?limit=20&offset=0&languageCode=en
   */
  app.get('/protocols', async (req, reply) => {
    const { limit = '20', offset = '0', languageCode } = req.query as Record<string, string>
    try {
      const protocols = await logosV2Service.listPublicProtocols({
        limit:        parseInt(limit),
        offset:       parseInt(offset),
        languageCode: languageCode as string | undefined,
      })
      return reply.send(protocols)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  /**
   * GET /protocols/:protocolId
   */
  app.get('/protocols/:protocolId', async (req, reply) => {
    const { protocolId } = req.params as { protocolId: string }
    try {
      const protocol = await logosV2Service.getProtocol(protocolId)
      if (!protocol) return reply.code(404).send({ error: 'Protocol not found' })
      return reply.send(protocol)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Ambient AI Surfacing ───────────────────────────────────────────────────

  /**
   * POST /ambient
   * Body: { context, userId?, languageCode?, limit? }
   * Returns ranked ambient knowledge suggestions for what the user is currently working on.
   */
  app.post('/ambient', async (req, reply) => {
    const {
      context, userId, languageCode = 'en', limit = 5,
    } = req.body as {
      context:       string
      userId?:       string
      languageCode?: string
      limit?:        number
    }

    if (!context?.trim()) return reply.code(400).send({ error: 'context required' })

    // Prefer auth user id but allow anonymous ambient surfacing
    let resolvedUserId = userId
    try {
      const authUserId = (req.user as { sub: string }).sub
      if (authUserId) resolvedUserId = authUserId
    } catch {}

    try {
      const suggestions = await logosV2Service.getAmbientSuggestions({
        context,
        userId:       resolvedUserId,
        languageCode,
        limit,
      })
      return reply.send({ suggestions })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Cross-Graph Synthesis ──────────────────────────────────────────────────

  /**
   * POST /synthesize
   * Body: { graphIds, question, languageCode? }
   * Synthesizes knowledge from multiple public graphs to answer a cross-domain question.
   */
  app.post('/synthesize', async (req, reply) => {
    const {
      graphIds, question, languageCode = 'en',
    } = req.body as {
      graphIds:      string[]
      question:      string
      languageCode?: string
    }

    if (!Array.isArray(graphIds) || graphIds.length < 2) {
      return reply.code(400).send({ error: 'graphIds must be an array of at least 2 graph ids' })
    }
    if (graphIds.length > 10) {
      return reply.code(400).send({ error: 'Maximum 10 graphs per synthesis request' })
    }
    if (!question?.trim()) {
      return reply.code(400).send({ error: 'question required' })
    }

    try {
      const synthesis = await logosV2Service.synthesizeAcrossGraphs({
        graphIds, question, languageCode,
      })
      return reply.send(synthesis)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Knowledge Gap Detection ────────────────────────────────────────────────

  /**
   * GET /kb/:kbId/gaps?topic=&languageCode=en
   * Analyzes a knowledge base for topical gaps.
   */
  app.get('/kb/:kbId/gaps', { preHandler: requireAuth }, async (req, reply) => {
    const { kbId }                        = req.params as { kbId: string }
    const { topic = '', languageCode = 'en' } = req.query as Record<string, string>

    try {
      const gaps = await logosV2Service.detectKnowledgeGaps(kbId, topic, languageCode)
      return reply.send(gaps)
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── Contradiction Detection ────────────────────────────────────────────────

  /**
   * GET /graphs/:graphId/contradictions
   * Returns pairs of nodes connected by 'contradicts' edges in the graph.
   */
  app.get('/graphs/:graphId/contradictions', async (req, reply) => {
    const { graphId } = req.params as { graphId: string }
    try {
      const contradictions = await logosV2Service.detectContradictions(graphId)
      return reply.send({ graphId, contradictions, count: contradictions.length })
    } catch (err: any) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
