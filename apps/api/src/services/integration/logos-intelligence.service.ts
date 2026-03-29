/**
 * LOGOS Intelligence Bridge Service
 *
 * Extracts demand signals from the LOGOS community knowledge graph
 * and surfaces them to the supply chain forecasting engine.
 *
 * Pipeline:
 *   1. Scan LOGOS knowledge graphs for supply-chain relevant nodes
 *   2. Use Claude Haiku to classify nodes semantically
 *   3. Convert semantic content → structured demand signals
 *   4. Store in demand_signals table with confidence + magnitude
 *   5. Tauri desktop node polls API to augment local ONNX forecasting
 *
 * Data Sources:
 *   - logos_nodes: community knowledge (text, audio transcripts, etc.)
 *   - logos_graphs: curated collections with locations/contexts
 *
 * Output:
 *   - demand_signals table: SKU × location × signal_type × magnitude
 *   - logos_supply_links: cross-referencing for transparency
 */

import Anthropic from '@anthropic-ai/sdk'
import { CohereClientV2 } from 'cohere-ai'
import { supabaseAdmin } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY })
const EMBED_MODEL = 'embed-multilingual-v3.0'

// ────────────────────────────────────────────────────────────────────────────

export interface DemandSignal {
  id?: string
  skuExternalId: string
  locationCode?: string
  source: 'logos' | 'community' | 'manual' | 'market'
  signalType: 'demand_spike' | 'trend_up' | 'trend_down' | 'seasonal' | 'alert'
  magnitude: number       // multiplier: 1.5 = 50% demand increase
  confidence: number      // 0-1
  logosNodeId?: string
  context: string         // human-readable explanation
  validFrom: Date
  validUntil?: Date
}

export interface SupplierIntelligence {
  supplierDid: string
  communityScore: number     // 0-1 community sentiment
  mentionCount: number
  recentSentiment: 'positive' | 'neutral' | 'negative'
  keyThemes: string[]
  alerts: string[]
}

export interface MarketContext {
  locationCode: string
  conditions: 'normal' | 'disrupted' | 'high_demand' | 'oversupply'
  topCommodities: Array<{ name: string; trend: 'up' | 'down' | 'stable'; magnitude: number }>
  alerts: string[]
  updatedAt: Date
}

// ────────────────────────────────────────────────────────────────────────────

export class LogosIntelligenceService {

  /**
   * Extract demand signals from LOGOS graphs.
   * Uses Claude Haiku to classify nodes as supply-chain relevant.
   * Runs as a background job (called by a cron or on-demand).
   */
  async extractDemandSignals(params: {
    graphIds?: string[]    // specific graphs, or all public graphs if omitted
    since?: Date           // only process nodes created/updated since this date
  }): Promise<DemandSignal[]> {
    const { graphIds, since } = params
    const results: DemandSignal[] = []

    // Query for LOGOS nodes to process
    let query = supabaseAdmin
      .from('logos_nodes')
      .select('id, title, content, language_code, created_at')
      .eq('is_public', true)

    if (since) {
      query = query.gte('created_at', since.toISOString())
    }

    const { data: nodes, error } = await query.limit(100)

    if (error || !nodes) {
      throw new Error(`Failed to fetch LOGOS nodes: ${error?.message}`)
    }

    // Filter to relevant graphs if specified
    let nodesToProcess = nodes
    if (graphIds && graphIds.length > 0) {
      const { data: graphNodes } = await supabaseAdmin
        .from('logos_graphs')
        .select('node_ids')
        .in('id', graphIds)

      const nodeIds = new Set<string>()
      graphNodes?.forEach(g => {
        if (Array.isArray(g.node_ids)) {
          g.node_ids.forEach(id => nodeIds.add(id))
        }
      })

      nodesToProcess = nodes.filter(n => nodeIds.has(n.id))
    }

    // Classify each node with Claude
    for (const node of nodesToProcess) {
      try {
        const signal = await this.classifyNodeForDemand(node)
        if (signal) {
          results.push(signal)
          // Upsert into demand_signals table
          await this.storeDemandSignal(signal)
        }
      } catch (err: any) {
        console.error(`Failed to classify node ${node.id}:`, err.message)
        // Continue with next node
      }
    }

    return results
  }

  /**
   * Classify a single LOGOS node using Claude.
   * Returns null if not supply-chain relevant.
   */
  private async classifyNodeForDemand(node: {
    id: string
    title: string
    content: string
    language_code: string
    created_at: string
  }): Promise<DemandSignal | null> {
    const prompt = `You are analyzing community knowledge graph nodes for supply chain demand signals.

Node title: "${node.title}"
Node content: "${node.content.substring(0, 500)}"${node.content.length > 500 ? '...' : ''}
Language: ${node.language_code}

Classify this node for supply chain relevance:

1. Is it supply-chain relevant? (yes/no)
   - Look for mentions of: products (mango, cement, rice), locations (Lagos, Nairobi, Accra),
     scarcity/shortage/high-demand, seasonal patterns, market conditions
2. If yes, extract:
   - SKU/product category (1-3 keywords, e.g. "mango", "fresh fruit")
   - Signal type: demand_spike | trend_up | trend_down | seasonal | alert
   - Magnitude: 0.5 (strong decrease) to 2.0 (strong increase), 1.0 = neutral/baseline
   - Confidence: 0.0 to 1.0 (how sure are you about this classification)

Respond ONLY as valid JSON on a single line:
{ "relevant": boolean, "sku_keywords": string[], "signal_type": string, "magnitude": number, "confidence": number }`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        { role: 'user', content: prompt }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    let classification
    try {
      classification = JSON.parse(content.text)
    } catch {
      console.warn(`Failed to parse Claude response for node ${node.id}`)
      return null
    }

    if (!classification.relevant) {
      return null
    }

    // Extract location from node content using embeddings
    const locationCode = await this.extractLocationFromContent(node.content, node.language_code)

    const signal: DemandSignal = {
      skuExternalId: classification.sku_keywords.join('-').toLowerCase(),
      locationCode,
      source: 'logos',
      signalType: classification.signal_type,
      magnitude: classification.magnitude,
      confidence: classification.confidence,
      logosNodeId: node.id,
      context: `From LOGOS node "${node.title}": ${node.content.substring(0, 200)}...`,
      validFrom: new Date(node.created_at),
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }

    return signal
  }

  /**
   * Extract location hints from node content using semantic similarity.
   * Returns ISO country code (e.g., 'NG', 'KE', 'GH') or undefined.
   */
  private async extractLocationFromContent(content: string, languageCode: string): Promise<string | undefined> {
    // Quick keyword match for common African locations
    const locationMap: Record<string, string> = {
      'lagos': 'NG', 'nairobi': 'KE', 'accra': 'GH', 'kampala': 'UG',
      'dar es salaam': 'TZ', 'cape town': 'ZA', 'addis': 'ET', 'cairo': 'EG',
      'abuja': 'NG', 'kigali': 'RW', 'harare': 'ZW', 'lusaka': 'ZM',
      'maputo': 'MZ', 'antananarivo': 'MG', 'kinshas': 'CD', 'kinshasa': 'CD',
    }

    const contentLower = content.toLowerCase()
    for (const [location, code] of Object.entries(locationMap)) {
      if (contentLower.includes(location)) {
        return code
      }
    }

    return undefined
  }

  /**
   * Store a demand signal in the database.
   */
  private async storeDemandSignal(signal: DemandSignal): Promise<void> {
    const { error } = await supabaseAdmin
      .from('demand_signals')
      .upsert(
        {
          sku_external_id: signal.skuExternalId,
          location_code: signal.locationCode,
          source: signal.source,
          signal_type: signal.signalType,
          magnitude: signal.magnitude,
          confidence: signal.confidence,
          logos_node_id: signal.logosNodeId,
          valid_from: signal.validFrom.toISOString(),
          valid_until: signal.validUntil?.toISOString(),
        },
        {
          onConflict: 'logos_node_id',
        }
      )

    if (error) {
      throw new Error(`Failed to store demand signal: ${error.message}`)
    }

    // Also create/update the cross-reference link
    if (signal.logosNodeId) {
      await this.linkNodeToEntity({
        logosNodeId: signal.logosNodeId,
        entityType: 'sku',
        entityId: signal.skuExternalId,
        relevance: signal.confidence,
      })
    }
  }

  /**
   * Get active demand signals for a SKU / product category.
   * skuKeywords: e.g. ['mango', 'fresh fruit', 'agricultural']
   * locationCode: ISO region code or country code
   */
  async getDemandSignals(params: {
    skuKeywords: string[]
    locationCode?: string
    limit?: number
  }): Promise<DemandSignal[]> {
    const { skuKeywords, locationCode, limit = 20 } = params

    let query = supabaseAdmin
      .from('demand_signals')
      .select('*')
      .gt('valid_until', new Date().toISOString()) // Only active signals

    // Filter by SKU keywords (fuzzy match on sku_external_id)
    if (skuKeywords.length > 0) {
      const pattern = skuKeywords.map(k => k.toLowerCase()).join('|')
      query = query.filter('sku_external_id', 'ilike', `%${pattern}%`)
    }

    if (locationCode) {
      query = query.eq('location_code', locationCode)
    }

    const { data, error } = await query.limit(limit)

    if (error) {
      throw new Error(`Failed to fetch demand signals: ${error.message}`)
    }

    return (data || []).map(d => ({
      skuExternalId: d.sku_external_id,
      locationCode: d.location_code,
      source: d.source,
      signalType: d.signal_type,
      magnitude: d.magnitude,
      confidence: d.confidence,
      logosNodeId: d.logos_node_id,
      context: `Signal stored from ${d.source} source`,
      validFrom: new Date(d.valid_from),
      validUntil: d.valid_until ? new Date(d.valid_until) : undefined,
    }))
  }

  /**
   * Get supplier intelligence from LOGOS.
   * Looks for nodes related to a supplier DID or supplier name/industry.
   * Returns reputation signals, community sentiment.
   */
  async getSupplierIntelligence(params: {
    supplierDid: string
    supplierName?: string
    industry?: string
  }): Promise<SupplierIntelligence> {
    const { supplierDid, supplierName, industry } = params

    // Get supplier's node identity
    const { data: nodeIdentity } = await supabaseAdmin
      .from('node_identities')
      .select('*')
      .eq('did', supplierDid)
      .single()

    // Search LOGOS for nodes mentioning this supplier
    const searchQuery = supplierName || supplierDid
    const { data: mentions } = await supabaseAdmin
      .from('logos_nodes')
      .select('id, title, content, is_verified')
      .ilike('content', `%${searchQuery}%`)
      .eq('is_public', true)
      .limit(20)

    // Sentiment analysis via Claude
    let sentimentScore = 0.5
    const themes = new Set<string>()
    const alerts: string[] = []

    if (mentions && mentions.length > 0) {
      for (const mention of mentions.slice(0, 5)) { // Analyze top 5 mentions
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 150,
          messages: [
            {
              role: 'user',
              content: `Analyze sentiment of this text about a supplier:\n"${mention.content.substring(0, 300)}"\n\nRespond as JSON: { "sentiment": "positive"|"negative"|"neutral", "themes": ["theme1"], "alert": "warning_text_or_null" }`
            }
          ]
        })

        const content = response.content[0]
        if (content.type === 'text') {
          try {
            const analysis = JSON.parse(content.text)
            if (analysis.sentiment === 'positive') sentimentScore += 0.1
            else if (analysis.sentiment === 'negative') sentimentScore -= 0.1
            if (analysis.themes) analysis.themes.forEach((t: string) => themes.add(t))
            if (analysis.alert) alerts.push(analysis.alert)
          } catch {
            // Skip parse errors
          }
        }
      }
    }

    sentimentScore = Math.max(0, Math.min(1, sentimentScore))
    const recentSentiment = sentimentScore > 0.6 ? 'positive' : sentimentScore < 0.4 ? 'negative' : 'neutral'

    return {
      supplierDid,
      communityScore: sentimentScore,
      mentionCount: mentions?.length || 0,
      recentSentiment,
      keyThemes: Array.from(themes),
      alerts,
    }
  }

  /**
   * Link a LOGOS node to a supply chain entity.
   * Creates an entry in logos_supply_links table.
   */
  async linkNodeToEntity(params: {
    logosNodeId: string
    entityType: 'sku' | 'supplier' | 'route' | 'location'
    entityId: string
    relevance?: number
  }): Promise<void> {
    const { logosNodeId, entityType, entityId, relevance = 0.5 } = params

    const { error } = await supabaseAdmin
      .from('logos_supply_links')
      .upsert(
        {
          logos_node_id: logosNodeId,
          entity_type: entityType,
          entity_id: entityId,
          relevance,
        },
        {
          onConflict: 'logos_node_id,entity_type,entity_id',
        }
      )

    if (error) {
      throw new Error(`Failed to link LOGOS node to entity: ${error.message}`)
    }
  }

  /**
   * Get LOGOS-powered market context for a location.
   * Returns current community-reported market conditions.
   */
  async getMarketContext(locationCode: string): Promise<MarketContext> {
    // Get recent demand signals for this location
    const { data: signals } = await supabaseAdmin
      .from('demand_signals')
      .select('*')
      .eq('location_code', locationCode)
      .gt('valid_until', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50)

    // Aggregate signals to determine market conditions
    let condition: 'normal' | 'disrupted' | 'high_demand' | 'oversupply' = 'normal'
    const commodityMap = new Map<string, number[]>()
    let alerts: string[] = []

    if (signals && signals.length > 0) {
      for (const signal of signals) {
        const keywords = signal.sku_external_id.split('-')
        for (const kw of keywords) {
          if (!commodityMap.has(kw)) commodityMap.set(kw, [])
          commodityMap.get(kw)!.push(signal.magnitude)
        }

        if (signal.signal_type === 'alert') {
          alerts.push(`Alert: ${signal.signal_type} for ${signal.sku_external_id}`)
        }
      }

      // Determine overall condition
      const avgMagnitude =
        Array.from(commodityMap.values())
          .flat()
          .reduce((a, b) => a + b, 0) / signals.length

      if (avgMagnitude > 1.3) condition = 'high_demand'
      else if (avgMagnitude < 0.7) condition = 'oversupply'
      else if (signals.some(s => s.signal_type === 'alert')) condition = 'disrupted'
    }

    const topCommodities = Array.from(commodityMap.entries())
      .map(([name, magnitudes]) => {
        const avg = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length
        return {
          name,
          trend: avg > 1.1 ? 'up' : avg < 0.9 ? 'down' : 'stable',
          magnitude: avg,
        }
      })
      .sort((a, b) => Math.abs(b.magnitude - 1) - Math.abs(a.magnitude - 1))
      .slice(0, 5)

    return {
      locationCode,
      conditions: condition,
      topCommodities,
      alerts,
      updatedAt: new Date(),
    }
  }
}

export const logosIntelligenceService = new LogosIntelligenceService()
