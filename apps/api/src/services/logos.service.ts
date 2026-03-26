/**
 * LOGOS Layer Service — Pillar 2
 *
 * LOGOS is the AI knowledge protocol powering NEXUS.
 * Every piece of knowledge created on the platform flows through LOGOS:
 *  - Nodes: atomic knowledge units (text, image, audio, video, link)
 *  - Graphs: curated collections of nodes with relationship edges
 *  - Protocols: reusable knowledge templates (curricula, onboarding flows, FAQ banks)
 *  - Citations: source attribution chain for every answer NEXUS generates
 *  - Verifications: community + AI fact-check layer
 *
 * Data tables (Supabase):
 *   logos_nodes     — id, creator_id, title, content, content_type, language_code,
 *                      embedding vector(1536), is_public, is_verified, view_count,
 *                      citation_count, created_at
 *   logos_graphs    — id, creator_id, title, description, node_ids uuid[], is_public,
 *                      is_protocol, fork_count, created_at
 *   logos_edges     — id, graph_id, from_node_id, to_node_id, relationship_type,
 *                      weight float, created_at
 *   logos_citations — id, node_id, cited_by_node_id, cited_by_type, created_at
 *   logos_verifications — id, node_id, verifier_id, verdict (verified|disputed|needs_review),
 *                         reason, created_at
 */

import Anthropic                from '@anthropic-ai/sdk'
import { CohereClientV2 }       from 'cohere-ai'
import { supabaseAdmin }        from '../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const cohere    = new CohereClientV2({ token: process.env.COHERE_API_KEY })

const EMBED_MODEL = 'embed-multilingual-v3.0'
const LOGOS_NS    = 'nexus_logos'

// ── Types ────────────────────────────────────────────────────────────────────

export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'link' | 'formula'
export type RelType     = 'prerequisite' | 'related' | 'contradicts' | 'supports' | 'example_of' | 'derived_from'
export type Verdict     = 'verified' | 'disputed' | 'needs_review'

interface CreateNodeParams {
  creatorId:    string
  title:        string
  content:      string
  contentType:  ContentType
  languageCode: string
  isPublic:     boolean
  sourceUrl?:   string
  tags?:        string[]
}

interface CreateGraphParams {
  creatorId:   string
  title:       string
  description: string
  nodeIds:     string[]
  isPublic:    boolean
  isProtocol:  boolean
}

interface SemanticSearchParams {
  query:        string
  languageCode: string
  limit?:       number
  contentType?: ContentType
  verifiedOnly?: boolean
}

interface SynthesizeParams {
  question:     string
  languageCode: string
  topK?:        number
  userId:       string
}

// ── Service class ─────────────────────────────────────────────────────────────

export class LogosService {

  // ── Nodes ─────────────────────────────────────────────────────────────────

  async createNode(params: CreateNodeParams): Promise<{ nodeId: string; summary: string }> {
    const { creatorId, title, content, contentType, languageCode, isPublic, sourceUrl, tags } = params

    // Generate summary + embedding in parallel
    const [summary, embedding] = await Promise.all([
      this.summariseContent(title, content, languageCode),
      this.embedText(`${title}\n\n${content}`, languageCode),
    ])

    const { data: node, error } = await supabaseAdmin
      .from('logos_nodes')
      .insert({
        creator_id:    creatorId,
        title,
        content,
        content_type:  contentType,
        language_code: languageCode,
        is_public:     isPublic,
        is_verified:   false,
        summary,
        source_url:    sourceUrl ?? null,
        tags:          tags ?? [],
        embedding,
        view_count:    0,
        citation_count: 0,
      })
      .select('id')
      .single()

    if (error) throw new Error(`logos.createNode: ${error.message}`)
    return { nodeId: node.id, summary }
  }

  async getNode(nodeId: string, requesterId?: string) {
    const { data, error } = await supabaseAdmin
      .from('logos_nodes')
      .select('*')
      .eq('id', nodeId)
      .single()

    if (error) throw new Error('Node not found')
    if (!data.is_public && data.creator_id !== requesterId) {
      throw new Error('Access denied')
    }

    // Increment view count (fire-and-forget)
    supabaseAdmin
      .from('logos_nodes')
      .update({ view_count: (data.view_count ?? 0) + 1 })
      .eq('id', nodeId)
      .then(() => {})

    return data
  }

  async listPublicNodes(opts: { limit?: number; offset?: number; languageCode?: string; contentType?: ContentType; tag?: string }) {
    let q = supabaseAdmin
      .from('logos_nodes')
      .select('id, title, summary, content_type, language_code, tags, is_verified, view_count, citation_count, creator_id, created_at')
      .eq('is_public', true)
      .order('view_count', { ascending: false })
      .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 20) - 1)

    if (opts.languageCode) q = q.eq('language_code', opts.languageCode)
    if (opts.contentType)  q = q.eq('content_type', opts.contentType)
    if (opts.tag)          q = q.contains('tags', [opts.tag])

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data
  }

  async myNodes(userId: string, opts: { limit?: number; offset?: number }) {
    const { data, error } = await supabaseAdmin
      .from('logos_nodes')
      .select('id, title, summary, content_type, language_code, is_public, is_verified, view_count, created_at')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false })
      .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 20) - 1)

    if (error) throw new Error(error.message)
    return data
  }

  async updateNode(nodeId: string, userId: string, updates: Partial<{ title: string; content: string; isPublic: boolean; tags: string[] }>) {
    const { data: existing } = await supabaseAdmin
      .from('logos_nodes')
      .select('creator_id, title, content')
      .eq('id', nodeId)
      .single()

    if (!existing || existing.creator_id !== userId) throw new Error('Access denied')

    const patch: Record<string, any> = {}
    if (updates.title   !== undefined) patch.title     = updates.title
    if (updates.isPublic !== undefined) patch.is_public = updates.isPublic
    if (updates.tags    !== undefined) patch.tags      = updates.tags

    // Re-embed if content changed
    if (updates.content !== undefined) {
      patch.content   = updates.content
      patch.embedding = await this.embedText(
        `${updates.title ?? existing.title}\n\n${updates.content}`,
        'en'
      )
      patch.is_verified = false  // needs re-verification after edit
    }

    const { error } = await supabaseAdmin
      .from('logos_nodes')
      .update(patch)
      .eq('id', nodeId)

    if (error) throw new Error(error.message)
  }

  async deleteNode(nodeId: string, userId: string) {
    const { data } = await supabaseAdmin
      .from('logos_nodes')
      .select('creator_id')
      .eq('id', nodeId)
      .single()

    if (!data || data.creator_id !== userId) throw new Error('Access denied')

    await supabaseAdmin.from('logos_nodes').delete().eq('id', nodeId)
  }

  // ── Graphs ────────────────────────────────────────────────────────────────

  async createGraph(params: CreateGraphParams): Promise<string> {
    const { creatorId, title, description, nodeIds, isPublic, isProtocol } = params

    const { data, error } = await supabaseAdmin
      .from('logos_graphs')
      .insert({
        creator_id:  creatorId,
        title,
        description,
        node_ids:    nodeIds,
        is_public:   isPublic,
        is_protocol: isProtocol,
        fork_count:  0,
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return data.id
  }

  async getGraph(graphId: string, requesterId?: string) {
    const { data, error } = await supabaseAdmin
      .from('logos_graphs')
      .select('*')
      .eq('id', graphId)
      .single()

    if (error) throw new Error('Graph not found')
    if (!data.is_public && data.creator_id !== requesterId) throw new Error('Access denied')

    // Fetch nodes + edges
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      supabaseAdmin.from('logos_nodes').select('id, title, summary, content_type, is_verified').in('id', data.node_ids ?? []),
      supabaseAdmin.from('logos_edges').select('*').eq('graph_id', graphId),
    ])

    return { ...data, nodes: nodes ?? [], edges: edges ?? [] }
  }

  async addEdge(graphId: string, userId: string, fromNodeId: string, toNodeId: string, relationship: RelType, weight = 1.0) {
    const { data: graph } = await supabaseAdmin.from('logos_graphs').select('creator_id').eq('id', graphId).single()
    if (!graph || graph.creator_id !== userId) throw new Error('Access denied')

    const { error } = await supabaseAdmin
      .from('logos_edges')
      .insert({ graph_id: graphId, from_node_id: fromNodeId, to_node_id: toNodeId, relationship_type: relationship, weight })

    if (error) throw new Error(error.message)
  }

  async forkGraph(graphId: string, userId: string): Promise<string> {
    const { data: original } = await supabaseAdmin
      .from('logos_graphs')
      .select('*')
      .eq('id', graphId)
      .single()

    if (!original || !original.is_public) throw new Error('Graph not forkable')

    const { data: fork, error } = await supabaseAdmin
      .from('logos_graphs')
      .insert({
        creator_id:  userId,
        title:       `${original.title} (fork)`,
        description: original.description,
        node_ids:    original.node_ids,
        is_public:   false,
        is_protocol: false,
        fork_count:  0,
        forked_from: graphId,
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)

    // Increment fork count on original
    await supabaseAdmin
      .from('logos_graphs')
      .update({ fork_count: (original.fork_count ?? 0) + 1 })
      .eq('id', graphId)

    return fork.id
  }

  // ── Semantic Search ───────────────────────────────────────────────────────

  async semanticSearch(params: SemanticSearchParams) {
    const { query, languageCode, limit = 10, contentType, verifiedOnly } = params

    const queryVector = await this.embedText(query, languageCode)

    // Call Supabase RPC for vector similarity search
    const { data, error } = await supabaseAdmin.rpc('match_logos_nodes', {
      query_embedding: queryVector,
      match_count:     limit * 2, // over-fetch for post-filter
      namespace:       LOGOS_NS,
    })

    if (error) throw new Error(error.message)

    let results = data as Array<{
      id: string; title: string; summary: string; content_type: string;
      language_code: string; is_verified: boolean; similarity: number;
      creator_id: string; tags: string[]; view_count: number
    }>

    if (contentType)   results = results.filter(r => r.content_type === contentType)
    if (verifiedOnly)  results = results.filter(r => r.is_verified)

    return results.slice(0, limit)
  }

  // ── Synthesis (RAG over LOGOS nodes) ─────────────────────────────────────

  async synthesize(params: SynthesizeParams): Promise<{
    answer:    string
    nodeIds:   string[]
    citations: Array<{ nodeId: string; title: string; excerpt: string }>
    confidence: 'high' | 'medium' | 'low'
  }> {
    const { question, languageCode, topK = 8, userId } = params

    const queryVector = await this.embedText(question, languageCode)

    const { data: matches, error } = await supabaseAdmin.rpc('match_logos_nodes', {
      query_embedding: queryVector,
      match_count:     topK,
      namespace:       LOGOS_NS,
    })

    if (error || !matches?.length) {
      return {
        answer:     'No relevant knowledge found in LOGOS for this question.',
        nodeIds:    [],
        citations:  [],
        confidence: 'low',
      }
    }

    // Fetch full content for top matches
    const nodeIds = matches.map((m: any) => m.id)
    const { data: nodes } = await supabaseAdmin
      .from('logos_nodes')
      .select('id, title, content, is_verified')
      .in('id', nodeIds)

    const context = (nodes ?? [])
      .map((n, i) => `[${i + 1}] ${n.title}${n.is_verified ? ' ✓' : ''}\n${n.content.slice(0, 800)}`)
      .join('\n\n---\n\n')

    const systemPrompt = `You are LOGOS, the knowledge layer of NEXUS — a platform Built for Africa, Built by Africa.
Answer in ${languageCode === 'en' ? 'English' : `the language with code "${languageCode}"`}.
Use ONLY the provided context. Cite sources as [1], [2], etc.
Be concise, accurate, and culturally aware. If context is insufficient, say so.`

    const resp = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{
        role:    'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      }],
    })

    const answer = resp.content[0].type === 'text' ? resp.content[0].text : ''

    // Build citation list from cited [n] references in answer
    const citedIdxs = [...answer.matchAll(/\[(\d+)\]/g)]
      .map(m => parseInt(m[1]) - 1)
      .filter((i, pos, arr) => arr.indexOf(i) === pos && i >= 0 && i < (nodes ?? []).length)

    const citations = citedIdxs.map(i => ({
      nodeId:  (nodes ?? [])[i].id,
      title:   (nodes ?? [])[i].title,
      excerpt: (nodes ?? [])[i].content.slice(0, 150) + '…',
    }))

    // Increment citation counts
    if (citations.length) {
      for (const c of citations) {
        supabaseAdmin
          .from('logos_nodes')
          .select('citation_count')
          .eq('id', c.nodeId)
          .single()
          .then(({ data }) => {
            if (data) {
              supabaseAdmin
                .from('logos_nodes')
                .update({ citation_count: (data.citation_count ?? 0) + 1 })
                .eq('id', c.nodeId)
                .then(() => {})
            }
          })
      }
    }

    const highSim = matches.filter((m: any) => (m.similarity ?? 0) > 0.75).length
    const confidence = highSim >= 3 ? 'high' : highSim >= 1 ? 'medium' : 'low'

    return { answer, nodeIds, citations, confidence }
  }

  // ── Verification ──────────────────────────────────────────────────────────

  async submitVerification(nodeId: string, verifierId: string, verdict: Verdict, reason: string) {
    const { error } = await supabaseAdmin
      .from('logos_verifications')
      .insert({ node_id: nodeId, verifier_id: verifierId, verdict, reason })

    if (error) throw new Error(error.message)

    // Auto-verify if 3+ verified votes
    const { data: verifs } = await supabaseAdmin
      .from('logos_verifications')
      .select('verdict')
      .eq('node_id', nodeId)

    const verifiedCount = verifs?.filter(v => v.verdict === 'verified').length ?? 0
    const disputedCount = verifs?.filter(v => v.verdict === 'disputed').length ?? 0

    if (verifiedCount >= 3 && disputedCount === 0) {
      await supabaseAdmin.from('logos_nodes').update({ is_verified: true }).eq('id', nodeId)
    } else if (disputedCount >= 2) {
      await supabaseAdmin.from('logos_nodes').update({ is_verified: false }).eq('id', nodeId)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async embedText(text: string, _languageCode: string): Promise<number[]> {
    const resp = await cohere.embed({
      model:          EMBED_MODEL,
      texts:          [text.slice(0, 2048)],
      inputType:      'search_document',
      embeddingTypes: ['float'],
    })

    const floats = (resp.embeddings as any).float
    if (!floats?.[0]) throw new Error('Embedding failed')
    return floats[0]
  }

  private async summariseContent(title: string, content: string, languageCode: string): Promise<string> {
    const resp = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages:   [{
        role:    'user',
        content: `Summarise this knowledge node in 1-2 sentences (language: ${languageCode}):\n\nTitle: ${title}\n\n${content.slice(0, 1200)}`,
      }],
    })
    return resp.content[0].type === 'text' ? resp.content[0].text.trim() : ''
  }
}

export const logosService = new LogosService()
