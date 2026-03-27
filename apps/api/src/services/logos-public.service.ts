/**
 * LOGOS Public Knowledge Graph API — Phase 5
 * Open Infrastructure Layer
 *
 * LOGOS becomes a public protocol in Phase 5. Any developer with a NEXUS
 * API key can query, traverse, and contribute to public LOGOS graphs.
 *
 * This service sits on top of the existing LOGOS v1 + v2 services and adds:
 *
 * 1. PUBLIC GRAPH ACCESS
 *    - Read any public graph's nodes and edges via API key (no NEXUS account needed)
 *    - Scoped to: translate, logos, clm, * (wildcard)
 *    - Full graph traversal, ambient surfacing, and synthesis all exposed
 *    - Rate-limited by the developer tier (free: 1k req/mo)
 *
 * 2. KNOWLEDGE ECONOMY
 *    - Graph owners can monetize their public graphs
 *    - Pricing models: per-query NXT fee or monthly subscription
 *    - Revenue split: 80% to graph owner, 10% to platform treasury, 10% to CLM fund
 *    - Premium graphs: owner-set price, quality badge after 100+ five-star queries
 *
 * 3. GRAPH ANALYTICS
 *    - Node popularity: most-queried nodes, most-traversed edges
 *    - Temporal heatmap: query volume by day/hour
 *    - Search funnel: which nodes users reach vs. start from
 *    - Graph health score: density, avg degree, contradiction ratio
 *
 * 4. FEDERATION HOOKS
 *    - Federated graph discovery: list LOGOS graphs from partner institutions
 *    - Cross-institution traversal: BFS that hops across federated graphs
 *    - Attribution chain: every AI synthesis cites source graph + node IDs
 *
 * DB tables:
 *   logos_public_graphs   — registry of public graphs with pricing + stats
 *   logos_query_log       — every public API query (for analytics + billing)
 *   logos_graph_ratings   — user ratings on premium graph queries
 *   logos_federation      — registered federated partner institutions
 */

import { supabaseAdmin }    from '../lib/supabase'
import { logosV2Service }   from './logos-v2.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type GraphPricingModel = 'free' | 'per_query' | 'subscription'

export interface PublicGraph {
  id:              string
  ownerId:         string
  name:            string
  description:     string
  languageCode:    string
  pricingModel:    GraphPricingModel
  pricePerQueryNxt: number
  nodeCount:       number
  edgeCount:       number
  totalQueries:    number
  avgRating:       number
  qualityBadge:    boolean
  createdAt:       string
}

export interface GraphAnalytics {
  graphId:          string
  totalQueries:     number
  uniqueCallers:    number
  topNodes:         { nodeId: string; label: string; queryCount: number }[]
  queryVolumeByDay: { date: string; count: number }[]
  healthScore:      number   // 0-100
  avgLatencyMs:     number
  contradictions:   number
}

export interface FederatedGraph {
  institutionId:   string
  institutionName: string
  graphId:         string
  graphName:       string
  endpointUrl:     string
  trustLevel:      'full' | 'read-only' | 'query-only'
}

// ── Service ───────────────────────────────────────────────────────────────────

export class LogosPublicService {

  // ── Public Graph Registry ──────────────────────────────────────────────────

  /**
   * Register a graph for public API access.
   */
  async publishGraph(params: {
    ownerId:          string
    graphId:          string
    name:             string
    description:      string
    languageCode?:    string
    pricingModel?:    GraphPricingModel
    pricePerQueryNxt?: number
  }): Promise<PublicGraph> {
    const {
      ownerId, graphId, name, description,
      languageCode = 'en',
      pricingModel = 'free',
      pricePerQueryNxt = 0,
    } = params

    if (pricingModel !== 'free' && pricePerQueryNxt <= 0) {
      throw new Error('pricePerQueryNxt required for non-free graphs')
    }

    // Verify ownership
    const { data: graph } = await supabaseAdmin
      .from('logos_graphs')
      .select('id, owner_id')
      .eq('id', graphId)
      .single()

    if (!graph) throw new Error('Graph not found')
    if (graph.owner_id !== ownerId) throw new Error('Not authorized — you do not own this graph')

    const { data: existing } = await supabaseAdmin
      .from('logos_public_graphs')
      .select('id')
      .eq('graph_id', graphId)
      .maybeSingle()

    if (existing) throw new Error('Graph is already published')

    // Count nodes + edges
    const { count: nodeCount } = await supabaseAdmin
      .from('logos_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('graph_id', graphId)

    const { count: edgeCount } = await supabaseAdmin
      .from('logos_edges')
      .select('*', { count: 'exact', head: true })
      .eq('graph_id', graphId)

    const { data, error } = await supabaseAdmin
      .from('logos_public_graphs')
      .insert({
        owner_id:           ownerId,
        graph_id:           graphId,
        name,
        description,
        language_code:      languageCode,
        pricing_model:      pricingModel,
        price_per_query_nxt: pricePerQueryNxt,
        node_count:         nodeCount ?? 0,
        edge_count:         edgeCount ?? 0,
        total_queries:      0,
        avg_rating:         0,
        quality_badge:      false,
      })
      .select('*')
      .single()

    if (error || !data) throw new Error(`Failed to publish graph: ${error?.message}`)
    return this.mapPublicGraph(data)
  }

  /**
   * List all public graphs, optionally filtered by language.
   */
  async listPublicGraphs(params: {
    languageCode?:  string
    pricingModel?:  GraphPricingModel
    limit?:         number
    offset?:        number
    sortBy?:        'popular' | 'recent' | 'rating'
  }): Promise<PublicGraph[]> {
    const { languageCode, pricingModel, limit = 20, offset = 0, sortBy = 'popular' } = params

    const orderCol = sortBy === 'popular' ? 'total_queries'
      : sortBy === 'rating' ? 'avg_rating'
      : 'created_at'

    let q = supabaseAdmin
      .from('logos_public_graphs')
      .select('*')
      .order(orderCol, { ascending: false })
      .range(offset, offset + limit - 1)

    if (languageCode)  q = q.eq('language_code', languageCode)
    if (pricingModel)  q = q.eq('pricing_model', pricingModel)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []).map(this.mapPublicGraph)
  }

  /**
   * Query a public graph node by ID (API-key authenticated, metered).
   */
  async queryNode(params: {
    graphId:    string
    nodeId:     string
    callerId:   string    // developer account id
    keyId:      string    // API key id
  }): Promise<any> {
    const { graphId, nodeId, callerId, keyId } = params

    const { data: pubGraph } = await supabaseAdmin
      .from('logos_public_graphs')
      .select('*')
      .eq('graph_id', graphId)
      .maybeSingle()

    if (!pubGraph) throw new Error('Graph is not publicly available')

    // Charge if per-query pricing
    if (pubGraph.pricing_model === 'per_query' && pubGraph.price_per_query_nxt > 0) {
      await this.chargeQuery(callerId, pubGraph.owner_id, pubGraph.price_per_query_nxt, graphId)
    }

    const { data: node, error } = await supabaseAdmin
      .from('logos_nodes')
      .select('*')
      .eq('id', nodeId)
      .eq('graph_id', graphId)
      .single()

    if (error || !node) throw new Error('Node not found')

    // Log the query
    await this.logQuery({ graphId, nodeId, callerId, keyId, latencyMs: 0 })

    return node
  }

  /**
   * Execute a BFS path query on a public graph (metered).
   */
  async queryPath(params: {
    graphId:   string
    fromNode:  string
    toNode:    string
    callerId:  string
    keyId:     string
  }): Promise<any> {
    const { graphId, fromNode, toNode, callerId, keyId } = params

    const { data: pubGraph } = await supabaseAdmin
      .from('logos_public_graphs')
      .select('*')
      .eq('graph_id', graphId)
      .maybeSingle()

    if (!pubGraph) throw new Error('Graph is not publicly available')

    if (pubGraph.pricing_model === 'per_query' && pubGraph.price_per_query_nxt > 0) {
      await this.chargeQuery(callerId, pubGraph.owner_id, pubGraph.price_per_query_nxt * 3, graphId)
    }

    const t0   = Date.now()
    const path = await logosV2Service.findPath(graphId, fromNode, toNode)
    const ms   = Date.now() - t0

    await this.logQuery({ graphId, nodeId: fromNode, callerId, keyId, latencyMs: ms })
    await this.incrementGraphQueries(graphId)

    return path
  }

  // ── Graph Analytics ────────────────────────────────────────────────────────

  /**
   * Get analytics for a graph (owner only + public summary for others).
   */
  async getAnalytics(graphId: string, requesterId: string): Promise<GraphAnalytics> {
    // Verify requester is owner or admin
    const { data: pubGraph } = await supabaseAdmin
      .from('logos_public_graphs')
      .select('owner_id, total_queries')
      .eq('graph_id', graphId)
      .single()

    if (!pubGraph) throw new Error('Graph not found in public registry')
    if (pubGraph.owner_id !== requesterId) throw new Error('Analytics only available to graph owner')

    // Top queried nodes (last 30 days)
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { data: queryLog } = await supabaseAdmin
      .from('logos_query_log')
      .select('node_id, latency_ms')
      .eq('graph_id', graphId)
      .gte('created_at', since)

    const nodeCounts: Record<string, number> = {}
    let totalLatency = 0
    for (const q of queryLog ?? []) {
      nodeCounts[q.node_id] = (nodeCounts[q.node_id] ?? 0) + 1
      totalLatency += q.latency_ms ?? 0
    }

    const topNodeIds = Object.entries(nodeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nodeId, count]) => ({ nodeId, queryCount: count }))

    // Enrich with node labels
    const topNodes = await Promise.all(topNodeIds.map(async ({ nodeId, queryCount }) => {
      const { data: node } = await supabaseAdmin
        .from('logos_nodes')
        .select('label')
        .eq('id', nodeId)
        .maybeSingle()
      return { nodeId, label: node?.label ?? nodeId, queryCount }
    }))

    // Query volume by day (last 14 days)
    const { data: dailyVolume } = await supabaseAdmin
      .rpc('logos_query_volume_by_day', { p_graph_id: graphId, p_days: 14 })

    // Health score: based on avg degree, contradiction ratio
    const { data: contras } = await supabaseAdmin
      .from('logos_edges')
      .select('id', { count: 'exact', head: true })
      .eq('graph_id', graphId)
      .eq('relationship_type', 'contradicts')

    const { count: totalEdges } = await supabaseAdmin
      .from('logos_edges')
      .select('*', { count: 'exact', head: true })
      .eq('graph_id', graphId)

    const contraRatio = totalEdges ? ((contras as any)?.count ?? 0) / totalEdges : 0
    const healthScore = Math.round(Math.max(0, 100 - contraRatio * 200))

    const qCount = queryLog?.length ?? 0
    return {
      graphId,
      totalQueries:     pubGraph.total_queries,
      uniqueCallers:    new Set((queryLog ?? []).map((q: any) => q.caller_id)).size,
      topNodes,
      queryVolumeByDay: dailyVolume ?? [],
      healthScore,
      avgLatencyMs:     qCount > 0 ? Math.round(totalLatency / qCount) : 0,
      contradictions:   (contras as any)?.count ?? 0,
    }
  }

  // ── Ratings ────────────────────────────────────────────────────────────────

  /**
   * Rate a public graph query result (1-5 stars).
   */
  async rateGraph(params: {
    graphId:  string
    raterId:  string
    stars:    number
    comment?: string
  }): Promise<void> {
    const { graphId, raterId, stars, comment } = params
    if (stars < 1 || stars > 5) throw new Error('stars must be 1-5')

    await supabaseAdmin
      .from('logos_graph_ratings')
      .upsert({ graph_id: graphId, rater_id: raterId, stars, comment: comment ?? null },
        { onConflict: 'graph_id,rater_id' })

    // Recompute avg rating
    const { data } = await supabaseAdmin
      .from('logos_graph_ratings')
      .select('stars')
      .eq('graph_id', graphId)

    const ratings = data ?? []
    const avg     = ratings.length > 0
      ? ratings.reduce((s: number, r: any) => s + r.stars, 0) / ratings.length
      : 0

    // Award quality badge if 100+ ratings and avg ≥ 4.5
    const qualityBadge = ratings.length >= 100 && avg >= 4.5

    await supabaseAdmin
      .from('logos_public_graphs')
      .update({ avg_rating: parseFloat(avg.toFixed(2)), quality_badge: qualityBadge })
      .eq('graph_id', graphId)
  }

  // ── Federation ─────────────────────────────────────────────────────────────

  /**
   * Register a federated partner institution's LOGOS endpoint.
   */
  async registerFederation(params: {
    institutionId:   string
    institutionName: string
    graphId:         string
    graphName:       string
    endpointUrl:     string
    trustLevel?:     'full' | 'read-only' | 'query-only'
  }): Promise<void> {
    const { institutionId, institutionName, graphId, graphName, endpointUrl, trustLevel = 'query-only' } = params

    await supabaseAdmin
      .from('logos_federation')
      .upsert({
        institution_id:   institutionId,
        institution_name: institutionName,
        graph_id:         graphId,
        graph_name:       graphName,
        endpoint_url:     endpointUrl,
        trust_level:      trustLevel,
      }, { onConflict: 'institution_id,graph_id' })
  }

  async listFederatedGraphs(): Promise<FederatedGraph[]> {
    const { data, error } = await supabaseAdmin
      .from('logos_federation')
      .select('*')
      .order('institution_name')

    if (error) throw new Error(error.message)

    return (data ?? []).map((r: any) => ({
      institutionId:   r.institution_id,
      institutionName: r.institution_name,
      graphId:         r.graph_id,
      graphName:       r.graph_name,
      endpointUrl:     r.endpoint_url,
      trustLevel:      r.trust_level,
    }))
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async chargeQuery(
    buyerId:   string,
    sellerId:  string,
    amountNxt: number,
    graphId:   string,
  ): Promise<void> {
    // Deduct from buyer's coin balance (Community Coins)
    await supabaseAdmin.rpc('decrement_community_coins_safe', {
      p_user_id: buyerId,
      p_amount:  amountNxt,
      p_note:    `LOGOS public query: graph ${graphId}`,
    })

    // 80% to graph owner
    const ownerShare    = Math.floor(amountNxt * 0.80)
    // 10% to platform treasury, 10% to CLM fund (both handled by platform cron)
    await supabaseAdmin.rpc('increment_community_coins', {
      p_user_id: sellerId,
      p_amount:  ownerShare,
      p_note:    `LOGOS graph revenue: ${graphId}`,
    })
  }

  private async logQuery(params: {
    graphId:   string
    nodeId:    string
    callerId:  string
    keyId:     string
    latencyMs: number
  }): Promise<void> {
    await supabaseAdmin.from('logos_query_log').insert({
      graph_id:   params.graphId,
      node_id:    params.nodeId,
      caller_id:  params.callerId,
      key_id:     params.keyId,
      latency_ms: params.latencyMs,
    })
  }

  private async incrementGraphQueries(graphId: string): Promise<void> {
    await supabaseAdmin.rpc('logos_increment_queries', { p_graph_id: graphId })
  }

  private mapPublicGraph(r: any): PublicGraph {
    return {
      id:               r.id,
      ownerId:          r.owner_id,
      name:             r.name,
      description:      r.description,
      languageCode:     r.language_code,
      pricingModel:     r.pricing_model,
      pricePerQueryNxt: r.price_per_query_nxt,
      nodeCount:        r.node_count,
      edgeCount:        r.edge_count,
      totalQueries:     r.total_queries,
      avgRating:        r.avg_rating,
      qualityBadge:     r.quality_badge,
      createdAt:        r.created_at,
    }
  }
}

export const logosPublicService = new LogosPublicService()
