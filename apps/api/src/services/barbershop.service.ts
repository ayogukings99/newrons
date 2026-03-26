import { supabase } from '../utils/supabase'

export interface BarbershopProfile {
  id: string
  barberId: string
  shopName: string
  hubId?: string
  specialties: string[]
  baseCutPrice?: number
  currency: string
  priceList: Array<{ service: string; price: number }>
  totalCuts: number
  repeatClientRate: number
  avgWaitMinutes: number
  createdAt: string
}

export interface LineupEntry {
  id: string
  shopId: string
  clientId: string
  position: number
  serviceRequested: string
  status: 'waiting' | 'in_chair' | 'completed' | 'cancelled' | 'no_show'
  estimatedWaitMins: number
  joinedAt: string
  startedAt?: string
  completedAt?: string
  client?: { id: string; username: string; displayName: string; avatarUrl?: string }
}

export interface BarberCut {
  id: string
  barberId: string
  clientId: string
  styleName: string
  description?: string
  avatarRenderUrl?: string
  photoUrls: string[]
  clientConsented: boolean
  isPortfolio: boolean
  createdAt: string
}

export class BarbershopService {
  /**
   * Create or update a barbershop profile.
   */
  async upsertProfile(params: {
    barberId: string
    shopName: string
    specialties: string[]
    baseCutPrice?: number
    currency?: string
    priceList?: Array<{ service: string; price: number }>
    hubId?: string
  }): Promise<BarbershopProfile> {
    const { data, error } = await supabase
      .from('barbershop_profiles')
      .upsert({
        barber_id: params.barberId,
        shop_name: params.shopName,
        hub_id: params.hubId ?? null,
        specialties: params.specialties,
        base_cut_price: params.baseCutPrice ?? null,
        currency: params.currency ?? 'NGN',
        price_list: params.priceList ?? [],
      }, { onConflict: 'barber_id' })
      .select()
      .single()

    if (error) throw new Error(`Failed to upsert barbershop profile: ${error.message}`)
    return this.mapProfile(data)
  }

  /**
   * Get a barbershop profile by ID or barber's user ID.
   */
  async getProfile(shopId: string): Promise<BarbershopProfile> {
    const { data, error } = await supabase
      .from('barbershop_profiles')
      .select('*')
      .eq('id', shopId)
      .single()

    if (error || !data) throw new Error('Barbershop not found')
    return this.mapProfile(data)
  }

  /**
   * Get a barber's own shop profile.
   */
  async getProfileByBarber(barberId: string): Promise<BarbershopProfile | null> {
    const { data } = await supabase
      .from('barbershop_profiles')
      .select('*')
      .eq('barber_id', barberId)
      .maybeSingle()

    return data ? this.mapProfile(data) : null
  }

  /**
   * Find nearby barbershops using PostGIS spatial query.
   */
  async findNearby(params: {
    lat: number
    lng: number
    radiusKm?: number
    specialty?: string
    maxWaitMins?: number
  }): Promise<BarbershopProfile[]> {
    const radiusMeters = (params.radiusKm ?? 5) * 1000

    // PostGIS spatial query via Supabase RPC
    const { data, error } = await supabase.rpc('find_nearby_barbershops', {
      p_lat: params.lat,
      p_lng: params.lng,
      p_radius_meters: radiusMeters,
      p_specialty: params.specialty ?? null,
      p_max_wait_mins: params.maxWaitMins ?? null,
    })

    if (error) throw new Error(`Nearby search failed: ${error.message}`)
    return (data ?? []).map(this.mapProfile)
  }

  // ── Lineup Management ─────────────────────────────────────────

  /**
   * Get the current active lineup for a shop.
   * Used for the live queue board displayed in the shop.
   */
  async getLineup(shopId: string): Promise<LineupEntry[]> {
    const { data, error } = await supabase
      .from('barbershop_lineups')
      .select(`
        *,
        client:users!client_id (id, username, display_name, avatar_url)
      `)
      .eq('shop_id', shopId)
      .in('status', ['waiting', 'in_chair'])
      .order('position', { ascending: true })

    if (error) throw new Error(`Failed to get lineup: ${error.message}`)
    return (data ?? []).map(this.mapLineupEntry)
  }

  /**
   * Add a client to the lineup.
   * Calculates their estimated wait based on avg_wait_minutes * position.
   * Optionally locks in a deposit via escrow.
   */
  async joinLineup(params: {
    shopId: string
    clientId: string
    serviceRequested: string
    styleReferenceId?: string
  }): Promise<LineupEntry> {
    // Get current queue length to assign position
    const { count } = await supabase
      .from('barbershop_lineups')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', params.shopId)
      .in('status', ['waiting', 'in_chair'])

    const position = (count ?? 0) + 1

    // Get shop's avg_wait_minutes for ETA calculation
    const { data: shop } = await supabase
      .from('barbershop_profiles')
      .select('avg_wait_minutes')
      .eq('id', params.shopId)
      .single()

    const estimatedWaitMins = (shop?.avg_wait_minutes ?? 20) * (position - 1)

    const { data, error } = await supabase
      .from('barbershop_lineups')
      .insert({
        shop_id: params.shopId,
        client_id: params.clientId,
        position,
        service_requested: params.serviceRequested,
        style_reference_id: params.styleReferenceId ?? null,
        status: 'waiting',
        estimated_wait_mins: estimatedWaitMins,
        joined_at: new Date().toISOString(),
      })
      .select(`
        *,
        client:users!client_id (id, username, display_name, avatar_url)
      `)
      .single()

    if (error) throw new Error(`Failed to join lineup: ${error.message}`)
    return this.mapLineupEntry(data)
  }

  /**
   * Update lineup entry status (advance queue, mark in-chair, complete, cancel).
   * Triggers wait-time recalculation for remaining clients.
   */
  async updateLineupStatus(
    lineupId: string,
    shopId: string,
    status: 'waiting' | 'in_chair' | 'completed' | 'cancelled' | 'no_show'
  ): Promise<LineupEntry> {
    const updates: Record<string, any> = { status }

    if (status === 'in_chair') updates.started_at = new Date().toISOString()
    if (status === 'completed' || status === 'cancelled' || status === 'no_show') {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('barbershop_lineups')
      .update(updates)
      .eq('id', lineupId)
      .eq('shop_id', shopId)  // ownership check
      .select(`*, client:users!client_id (id, username, display_name, avatar_url)`)
      .single()

    if (error) throw new Error(`Failed to update lineup: ${error.message}`)

    // Recalculate estimated wait for remaining clients
    if (status === 'completed' || status === 'cancelled' || status === 'no_show') {
      await this.recalculateWaitTimes(shopId)
      // Update avg_wait_minutes stat if completed
      if (status === 'completed') {
        await this.updateAvgWaitTime(shopId)
      }
    }

    return this.mapLineupEntry(data)
  }

  // ── Portfolio & Cuts ──────────────────────────────────────────

  /**
   * Log a completed cut with optional avatar render and photo portfolio.
   * Client must consent before photos are added to portfolio.
   */
  async logCompletedCut(params: {
    barberId: string
    clientId: string
    lineupId: string
    styleName: string
    description?: string
    photoUrls?: string[]
    clientConsented: boolean
  }): Promise<BarberCut> {
    const { data, error } = await supabase
      .from('barbershop_cuts')
      .insert({
        barber_id: params.barberId,
        client_id: params.clientId,
        lineup_id: params.lineupId,
        style_name: params.styleName,
        description: params.description ?? null,
        photo_urls: params.clientConsented ? (params.photoUrls ?? []) : [],
        client_consented: params.clientConsented,
        is_portfolio: params.clientConsented && (params.photoUrls?.length ?? 0) > 0,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to log cut: ${error.message}`)

    // Increment total_cuts counter
    await supabase.rpc('increment_barber_cut_count', { p_barber_id: params.barberId })

    return this.mapCut(data)
  }

  /**
   * Get a barber's portfolio (cuts with client consent).
   */
  async getPortfolio(shopId: string, limit = 30): Promise<BarberCut[]> {
    const { data: shop } = await supabase
      .from('barbershop_profiles')
      .select('barber_id')
      .eq('id', shopId)
      .single()

    if (!shop) throw new Error('Shop not found')

    const { data, error } = await supabase
      .from('barbershop_cuts')
      .select('*')
      .eq('barber_id', shop.barber_id)
      .eq('is_portfolio', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(`Failed to get portfolio: ${error.message}`)
    return (data ?? []).map(this.mapCut)
  }

  // ── Private helpers ───────────────────────────────────────────

  private async recalculateWaitTimes(shopId: string) {
    const { data: shop } = await supabase
      .from('barbershop_profiles')
      .select('avg_wait_minutes')
      .eq('id', shopId)
      .single()

    const avgWait = shop?.avg_wait_minutes ?? 20

    const { data: lineup } = await supabase
      .from('barbershop_lineups')
      .select('id, position')
      .eq('shop_id', shopId)
      .eq('status', 'waiting')
      .order('position', { ascending: true })

    if (!lineup) return

    // Recalculate position numbers and wait times
    for (let i = 0; i < lineup.length; i++) {
      await supabase
        .from('barbershop_lineups')
        .update({
          position: i + 2, // +1 for the person in chair
          estimated_wait_mins: avgWait * i,
        })
        .eq('id', lineup[i].id)
    }
  }

  private async updateAvgWaitTime(shopId: string) {
    // Calculate new average from recent completed cuts
    const { data } = await supabase
      .from('barbershop_lineups')
      .select('started_at, completed_at')
      .eq('shop_id', shopId)
      .eq('status', 'completed')
      .not('started_at', 'is', null)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(20)

    if (!data || data.length < 3) return

    const durations = data
      .map(r => {
        const start = new Date(r.started_at!).getTime()
        const end = new Date(r.completed_at!).getTime()
        return Math.round((end - start) / 60000) // minutes
      })
      .filter(d => d > 0 && d < 120) // sanity check

    if (durations.length < 2) return

    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)

    await supabase
      .from('barbershop_profiles')
      .update({ avg_wait_minutes: avg })
      .eq('id', shopId)
  }

  private mapProfile(row: any): BarbershopProfile {
    return {
      id: String(row.id),
      barberId: String(row.barber_id),
      shopName: row.shop_name,
      hubId: row.hub_id ? String(row.hub_id) : undefined,
      specialties: row.specialties ?? [],
      baseCutPrice: row.base_cut_price ? Number(row.base_cut_price) : undefined,
      currency: row.currency,
      priceList: row.price_list ?? [],
      totalCuts: row.total_cuts,
      repeatClientRate: Number(row.repeat_client_rate),
      avgWaitMinutes: row.avg_wait_minutes,
      createdAt: row.created_at,
    }
  }

  private mapLineupEntry(row: any): LineupEntry {
    return {
      id: String(row.id),
      shopId: String(row.shop_id),
      clientId: String(row.client_id),
      position: row.position,
      serviceRequested: row.service_requested,
      status: row.status,
      estimatedWaitMins: row.estimated_wait_mins,
      joinedAt: row.joined_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      client: row.client ? {
        id: String(row.client.id),
        username: row.client.username,
        displayName: row.client.display_name,
        avatarUrl: row.client.avatar_url ?? undefined,
      } : undefined,
    }
  }

  private mapCut(row: any): BarberCut {
    return {
      id: String(row.id),
      barberId: String(row.barber_id),
      clientId: String(row.client_id),
      styleName: row.style_name,
      description: row.description ?? undefined,
      avatarRenderUrl: row.avatar_render_url ?? undefined,
      photoUrls: row.photo_urls ?? [],
      clientConsented: row.client_consented,
      isPortfolio: row.is_portfolio,
      createdAt: row.created_at,
    }
  }
}
