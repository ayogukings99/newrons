/**
 * LOGOS v2 Service — Phase 4
 *
 * LOGOS v1 was nodes + basic RAG. LOGOS v2 adds:
 *
 *  1. Graph traversal — follow edge chains to find reasoning paths between concepts
 *  2. Protocol templates — reusable knowledge flows (curriculum, onboarding, FAQ)
 *  3. Ambient AI surfacing — proactively surfaces relevant nodes during user activity
 *  4. Cross-graph synthesis — synthesize across multiple public graphs simultaneously
 *  5. Knowledge gap detection — identify what a user's KB is missing
 *  6. Contradiction detection — flag nodes that contradict each other in a graph
 *
 * All capabilities build on top of the logos.service.ts foundation.
 */

import Anthropic              from '@anthropic-ai/sdk'
import { CohereClientV2 }     from 'cohere-ai'
import { supabaseAdmin }      from '../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const cohere    = new CohereClientV2({ token: process.env.COHERE_API_KEY })
const EMBED_MODEL = 'embed-multilingual-v3.0'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TraversalPath {
  nodes:         Array<{ id: string; title: string; summary: string }>
  edges:         Array<{ from: string; to: string; relationship: string; weight: number }>
  totalWeight:   number
  reasoning:     string
}

export interface ProtocolTemplate {
  id:          string
  name:        string
  description: string
  steps:       ProtocolStep[]
  estimatedMinutes: number
}

export interface ProtocolStep {
  order:       number
  title:       string
  nodeId?:     string    // linked LOGOS node
  content:     string
  checkpoints: string[]  // things to verify before moving on
}

export interface AmbientSuggestion {
  nodeId:    string
  title:     string
  summary:   string
  relevance: number   // 0-1
  reason:    string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class LogosV2Service {

  // ── Graph traversal ────────────────────────────────────────────────────────

  /**
   * Find the shortest reasoning path between two nodes in a graph.
   * Uses BFS over logos_edges, weighing by edge weight.
   */
  async findPath(graphId: string, fromNodeId: string, toNodeId: string): Promise<TraversalPath | null> {
    const { data: edges } = await supabaseAdmin
      .from('logos_edges')
      .select('from_node_id, to_node_id, relationship_type, weight')
      .eq('graph_id', graphId)

    if (!edges?.length) return null

    // BFS
    const adj = new Map<string, Array<{ to: string; rel: string; weight: number }>>()
    for (const e of edges) {
      if (!adj.has(e.from_node_id)) adj.set(e.from_node_id, [])
      adj.get(e.from_node_id)!.push({ to: e.to_node_id, rel: e.relationship_type, weight: e.weight })
    }

    const visited = new Set<string>()
    const queue: Array<{ nodeId: string; path: string[]; edgePath: typeof edges; weight: number }> = [
      { nodeId: fromNodeId, path: [fromNodeId], edgePath: [], weight: 0 }
    ]

    while (queue.length) {
      const current = queue.shift()!
      if (current.nodeId === toNodeId) {
        // Fetch node details
        const { data: nodes } = await supabaseAdmin
          .from('logos_nodes')
          .select('id, title, summary')
          .in('id', current.path)

        const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]))

        return {
          nodes:       current.path.map(id => nodeMap.get(id) ?? { id, title: id, summary: '' }),
          edges:       current.edgePath.map(e => ({
            from:         e.from_node_id,
            to:           e.to_node_id,
            relationship: e.relationship_type,
            weight:       e.weight,
          })),
          totalWeight: current.weight,
          reasoning:   await this.explainPath(current.path, nodes ?? []),
        }
      }

      if (visited.has(current.nodeId)) continue
      visited.add(current.nodeId)

      for (const neighbor of (adj.get(current.nodeId) ?? [])) {
        if (!visited.has(neighbor.to)) {
          const matchingEdge = edges.find(
            e => e.from_node_id === current.nodeId && e.to_node_id === neighbor.to
          )
          queue.push({
            nodeId:   neighbor.to,
            path:     [...current.path, neighbor.to],
            edgePath: matchingEdge ? [...current.edgePath, matchingEdge] : current.edgePath,
            weight:   current.weight + neighbor.weight,
          })
        }
      }
    }

    return null  // No path found
  }

  // ── Protocol templates ─────────────────────────────────────────────────────

  async createProtocol(params: {
    creatorId:   string
    graphId:     string
    name:        string
    description: string
    nodeOrder:   string[]    // ordered node IDs forming the protocol
  }): Promise<string> {
    const { creatorId, graphId, name, description, nodeOrder } = params

    // Fetch nodes in order
    const { data: nodes } = await supabaseAdmin
      .from('logos_nodes')
      .select('id, title, content, summary')
      .in('id', nodeOrder)

    const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]))

    // Build steps from Claude
    const stepsJson = await this.generateProtocolSteps(
      name, description, nodeOrder.map(id => nodeMap.get(id)!).filter(Boolean)
    )

    const { data, error } = await supabaseAdmin
      .from('logos_protocols')
      .insert({
        creator_id:  creatorId,
        graph_id:    graphId,
        name,
        description,
        node_ids:    nodeOrder,
        steps:       stepsJson,
        is_public:   false,
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return data.id
  }

  async getProtocol(protocolId: string): Promise<ProtocolTemplate | null> {
    const { data, error } = await supabaseAdmin
      .from('logos_protocols')
      .select('*')
      .eq('id', protocolId)
      .single()

    if (error || !data) return null
    return {
      id:               data.id,
      name:             data.name,
      description:      data.description,
      steps:            data.steps ?? [],
      estimatedMinutes: (data.steps ?? []).length * 3,
    }
  }

  async listPublicProtocols(limit = 20): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('logos_protocols')
      .select('id, name, description, creator_id, created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit)
    return data ?? []
  }

  // ── Ambient AI surfacing ───────────────────────────────────────────────────

  /**
   * Given the user's current activity context (what they're reading/doing),
   * surface the 5 most relevant LOGOS nodes they haven't seen recently.
   */
  async getAmbientSuggestions(params: {
    userId:        string
    contextText:   string    // what the user is currently doing / reading
    languageCode:  string
    limit?:        number
  }): Promise<AmbientSuggestion[]> {
    const { userId, contextText, languageCode, limit = 5 } = params

    // Embed current context
    const resp = await cohere.embed({
      model:          EMBED_MODEL,
      texts:          [contextText.slice(0, 1500)],
      inputType:      'search_query',
      embeddingTypes: ['float'],
    })
    const queryVec = (resp.embeddings as any).float?.[0]
    if (!queryVec) return []

    // Find recently seen nodes to exclude
    const { data: recentViews } = await supabaseAdmin
      .from('logos_node_views')
      .select('node_id')
      .eq('user_id', userId)
      .gte('viewed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(50)

    const recentIds = (recentViews ?? []).map(r => r.node_id)

    const { data: matches } = await supabaseAdmin.rpc('match_logos_nodes', {
      query_embedding: queryVec,
      match_count:     limit * 3,
      namespace:       'nexus_logos',
    })

    const suggestions = (matches ?? [])
      .filter((m: any) => !recentIds.includes(m.id))
      .slice(0, limit)
      .map((m: any) => ({
        nodeId:    m.id,
        title:     m.title,
        summary:   m.summary ?? '',
        relevance: Math.round((m.similarity ?? 0) * 100) / 100,
        reason:    `Relevant to your current activity`,
      }))

    return suggestions
  }

  // ── Cross-graph synthesis ──────────────────────────────────────────────────

  async synthesizeAcrossGraphs(params: {
    graphIds:    string[]
    question:    string
    languageCode: string
    userId:      string
  }): Promise<{
    answer:    string
    sources:   Array<{ graphId: string; graphTitle: string; nodeId: string; nodeTitle: string }>
    conflicts: string[]
  }> {
    const { graphIds, question, languageCode, userId } = params

    // Collect all node IDs from all graphs
    const { data: graphs } = await supabaseAdmin
      .from('logos_graphs')
      .select('id, title, node_ids')
      .in('id', graphIds)
      .eq('is_public', true)

    if (!graphs?.length) throw new Error('No accessible graphs found')

    const allNodeIds = [...new Set(graphs.flatMap(g => g.node_ids ?? []))]

    // Fetch nodes
    const { data: nodes } = await supabaseAdmin
      .from('logos_nodes')
      .select('id, title, content, summary')
      .in('id', allNodeIds)
      .limit(30)

    const graphTitleMap = new Map(graphs.map(g => [g.id, g.title]))
    const nodeToGraph   = new Map<string, string>()
    for (const g of graphs) {
      for (const nid of (g.node_ids ?? [])) nodeToGraph.set(nid, g.id)
    }

    const context = (nodes ?? [])
      .map((n, i) => `[${i + 1}] [Graph: ${graphTitleMap.get(nodeToGraph.get(n.id) ?? '') ?? 'Unknown'}]\n${n.title}\n${n.content.slice(0, 600)}`)
      .join('\n\n---\n\n')

    const resp = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You are LOGOS v2, NEXUS's advanced knowledge layer. Synthesize across multiple knowledge graphs.
Answer in ${languageCode}. Cite sources as [1], [2], etc. Explicitly note any contradictions between sources.
Format conflicts as a "Conflicts:" section at the end if any exist.`,
      messages: [{ role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` }],
    })

    const text = resp.content[0].type === 'text' ? resp.content[0].text : ''

    // Extract conflict section
    const conflictMatch = text.match(/Conflicts?:([\s\S]*?)$/i)
    const conflicts     = conflictMatch
      ? conflictMatch[1].trim().split('\n').filter(l => l.trim()).map(l => l.replace(/^[-•]\s*/, ''))
      : []
    const answer = conflictMatch ? text.slice(0, conflictMatch.index).trim() : text

    // Map cited indices to source nodes
    const citedIdxs = [...text.matchAll(/\[(\d+)\]/g)]
      .map(m => parseInt(m[1]) - 1)
      .filter((i, p, a) => a.indexOf(i) === p && i >= 0 && i < (nodes ?? []).length)

    const sources = citedIdxs.map(i => {
      const node    = (nodes ?? [])[i]
      const graphId = nodeToGraph.get(node.id) ?? ''
      return { graphId, graphTitle: graphTitleMap.get(graphId) ?? '', nodeId: node.id, nodeTitle: node.title }
    })

    return { answer, sources, conflicts }
  }

  // ── Knowledge gap detection ────────────────────────────────────────────────

  async detectKnowledgeGaps(kbId: string, topic: string, languageCode: string): Promise<{
    gaps:        string[]
    suggestions: string[]
    coverage:    number    // 0-100 estimated coverage of the topic
  }> {
    // Fetch all documents in KB
    const { data: docs } = await supabaseAdmin
      .from('knowledge_base_documents')
      .select('title, content_summary')
      .eq('knowledge_base_id', kbId)

    if (!docs?.length) return { gaps: ['No documents found'], suggestions: [`Add content about "${topic}"`], coverage: 0 }

    const docSummaries = docs.map(d => `- ${d.title}: ${d.content_summary ?? ''}`).join('\n')

    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role:    'user',
        content: `Analyze this knowledge base for coverage of "${topic}" (in ${languageCode}).
Documents:\n${docSummaries}

Return JSON: { gaps: string[], suggestions: string[], coverage: number (0-100) }
gaps = topics not covered, suggestions = what to add, coverage = % of topic covered.`,
      }],
    })

    try {
      const text = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
      const json = text.match(/\{[\s\S]*\}/)
      return JSON.parse(json?.[0] ?? '{}')
    } catch {
      return { gaps: [], suggestions: [], coverage: 0 }
    }
  }

  // ── Contradiction detection ────────────────────────────────────────────────

  async detectContradictions(graphId: string): Promise<Array<{
    nodeA: string; nodeTitleA: string
    nodeB: string; nodeTitleB: string
    description: string
  }>> {
    // Fetch all nodes in graph
    const { data: graph } = await supabaseAdmin
      .from('logos_graphs')
      .select('node_ids')
      .eq('id', graphId)
      .single()

    if (!graph?.node_ids?.length) return []

    const { data: nodes } = await supabaseAdmin
      .from('logos_nodes')
      .select('id, title, content')
      .in('id', graph.node_ids)
      .limit(20)  // Only check first 20 for performance

    if (!nodes?.length) return []

    const pairs: Array<{ nodeA: string; nodeTitleA: string; nodeB: string; nodeTitleB: string; description: string }> = []

    // Check pairs with 'contradicts' edges first (fast path)
    const { data: contradictEdges } = await supabaseAdmin
      .from('logos_edges')
      .select('from_node_id, to_node_id')
      .eq('graph_id', graphId)
      .eq('relationship_type', 'contradicts')

    for (const edge of (contradictEdges ?? [])) {
      const a = nodes.find(n => n.id === edge.from_node_id)
      const b = nodes.find(n => n.id === edge.to_node_id)
      if (a && b) {
        pairs.push({
          nodeA: a.id, nodeTitleA: a.title,
          nodeB: b.id, nodeTitleB: b.title,
          description: 'Marked as contradicting via edge',
        })
      }
    }

    return pairs
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async explainPath(nodeIds: string[], nodes: Array<{ id: string; title: string; summary: string }>): Promise<string> {
    if (nodeIds.length < 2) return ''
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const titles  = nodeIds.map(id => nodeMap.get(id)?.title ?? id).join(' → ')

    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages:   [{
        role:    'user',
        content: `In one sentence, explain the conceptual path: ${titles}`,
      }],
    })
    return resp.content[0].type === 'text' ? resp.content[0].text.trim() : ''
  }

  private async generateProtocolSteps(
    name: string,
    description: string,
    nodes: Array<{ id: string; title: string; content: string; summary: string }>
  ): Promise<ProtocolStep[]> {
    const nodeList = nodes.map((n, i) => `Step ${i + 1}: "${n.title}" — ${n.summary}`).join('\n')

    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages:   [{
        role:    'user',
        content: `Create a learning protocol named "${name}" from these nodes:
${nodeList}

Return JSON array of steps, each with: { order, title, nodeId, content, checkpoints: string[] }
checkpoints = 2-3 things to verify mastery before progressing.`,
      }],
    })

    try {
      const text = resp.content[0].type === 'text' ? resp.content[0].text : '[]'
      const arr  = text.match(/\[[\s\S]*\]/)
      return JSON.parse(arr?.[0] ?? '[]')
    } catch {
      return nodes.map((n, i) => ({
        order:       i + 1,
        title:       n.title,
        nodeId:      n.id,
        content:     n.summary,
        checkpoints: ['Understood the concept', 'Can explain it in own words'],
      }))
    }
  }
}

export const logosV2Service = new LogosV2Service()
