/**
 * Creator Economy Service — Phase 3
 *
 * Powers the monetisation layer for African creators on NEXUS:
 *  - Content upload & publishing (video, audio, image, article, course)
 *  - Pricing models: free | tip_only | paid | subscription
 *  - Revenue streams: direct purchase, tipping, subscription share, affiliate
 *  - Royalty calculation & payout scheduling (real-money via Paystack/Flutterwave + community coins)
 *  - Affiliate links (earn % when you refer a purchase)
 *  - Creator dashboard metrics: earnings, views, conversion rate, top content
 *
 * Data tables (Supabase):
 *   creator_content     — id, creator_id, title, description, content_type,
 *                          media_url, thumbnail_url, price_amount, price_currency,
 *                          pricing_model, is_published, view_count, purchase_count,
 *                          total_earned, created_at
 *   content_purchases   — id, content_id, buyer_id, amount_paid, currency,
 *                          payment_ref, affiliate_id, royalty_paid, created_at
 *   content_tips        — id, content_id, tipper_id, amount, currency, message, created_at
 *   creator_subscriptions — id, subscriber_id, creator_id, plan (monthly|yearly),
 *                           amount, currency, status (active|cancelled|expired),
 *                           started_at, expires_at, payment_ref
 *   creator_payouts     — id, creator_id, amount, currency, status (pending|paid|failed),
 *                          payout_ref, period_start, period_end, created_at
 *   affiliate_links     — id, creator_id, content_id, code, commission_pct,
 *                          click_count, conversion_count, total_earned, created_at
 */

import { supabaseAdmin }   from '../lib/supabase'
import { r2Client, R2_BUCKET } from '../lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl }    from '@aws-sdk/s3-request-presigner'
import { nanoid }          from 'nanoid'

export type ContentType    = 'video' | 'audio' | 'image' | 'article' | 'course' | 'template'
export type PricingModel   = 'free' | 'tip_only' | 'paid' | 'subscription'
export type PayoutStatus   = 'pending' | 'paid' | 'failed'

const PLATFORM_FEE_PCT   = 0.10  // 10% platform fee
const AFFILIATE_FEE_PCT  = 0.05  // 5% affiliate commission (from platform fee)
const COIN_PER_NAIRA     = 100   // 100 coins per ₦1

// ── Service ───────────────────────────────────────────────────────────────────

export class CreatorEconomyService {

  // ── Content CRUD ──────────────────────────────────────────────────────────

  async getUploadUrl(creatorId: string, contentType: ContentType, mimeType: string): Promise<{
    uploadUrl: string; mediaKey: string
  }> {
    const ext      = mimeType.split('/')[1] ?? 'bin'
    const mediaKey = `creator/${creatorId}/${nanoid()}/${contentType}.${ext}`

    const uploadUrl = await getSignedUrl(
      r2Client,
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: mediaKey, ContentType: mimeType }),
      { expiresIn: 3600 }
    )

    return { uploadUrl, mediaKey }
  }

  async publishContent(params: {
    creatorId:    string
    title:        string
    description:  string
    contentType:  ContentType
    mediaKey:     string
    thumbnailKey?: string
    pricingModel: PricingModel
    priceAmount?: number
    priceCurrency?: string
    tags?:        string[]
    isPublished:  boolean
  }) {
    const {
      creatorId, title, description, contentType, mediaKey,
      thumbnailKey, pricingModel, priceAmount, priceCurrency = 'NGN',
      tags = [], isPublished,
    } = params

    const mediaUrl     = `${process.env.R2_PUBLIC_URL}/${mediaKey}`
    const thumbnailUrl = thumbnailKey ? `${process.env.R2_PUBLIC_URL}/${thumbnailKey}` : null

    const { data, error } = await supabaseAdmin
      .from('creator_content')
      .insert({
        creator_id:     creatorId,
        title,
        description,
        content_type:   contentType,
        media_url:      mediaUrl,
        thumbnail_url:  thumbnailUrl,
        pricing_model:  pricingModel,
        price_amount:   priceAmount ?? 0,
        price_currency: priceCurrency,
        tags,
        is_published:   isPublished,
        view_count:     0,
        purchase_count: 0,
        total_earned:   0,
      })
      .select('id')
      .single()

    if (error) throw new Error(`publishContent: ${error.message}`)
    return { contentId: data.id }
  }

  async getContent(contentId: string, requesterId?: string) {
    const { data, error } = await supabaseAdmin
      .from('creator_content')
      .select('*')
      .eq('id', contentId)
      .single()

    if (error || !data) throw new Error('Content not found')

    // Increment view (fire-and-forget)
    supabaseAdmin
      .from('creator_content')
      .update({ view_count: (data.view_count ?? 0) + 1 })
      .eq('id', contentId)
      .then(() => {})

    const hasPurchased = requesterId
      ? await this.hasPurchased(contentId, requesterId)
      : false

    // Only include media_url if free/tip_only or purchaser
    if (data.pricing_model === 'paid' && !hasPurchased && data.creator_id !== requesterId) {
      data.media_url = null
    }

    return { ...data, hasPurchased }
  }

  async listPublicContent(opts: {
    limit?: number; offset?: number; contentType?: ContentType
    creatorId?: string; tag?: string; pricingModel?: PricingModel
  }) {
    let q = supabaseAdmin
      .from('creator_content')
      .select('id, creator_id, title, description, content_type, thumbnail_url, pricing_model, price_amount, price_currency, tags, view_count, purchase_count, created_at')
      .eq('is_published', true)
      .order('view_count', { ascending: false })
      .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 20) - 1)

    if (opts.contentType)  q = q.eq('content_type', opts.contentType)
    if (opts.creatorId)    q = q.eq('creator_id', opts.creatorId)
    if (opts.pricingModel) q = q.eq('pricing_model', opts.pricingModel)
    if (opts.tag)          q = q.contains('tags', [opts.tag])

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data
  }

  async updateContent(contentId: string, creatorId: string, updates: Partial<{
    title: string; description: string; isPublished: boolean
    priceAmount: number; pricingModel: PricingModel; tags: string[]
  }>) {
    const patch: Record<string, any> = {}
    if (updates.title        !== undefined) patch.title         = updates.title
    if (updates.description  !== undefined) patch.description   = updates.description
    if (updates.isPublished  !== undefined) patch.is_published  = updates.isPublished
    if (updates.priceAmount  !== undefined) patch.price_amount  = updates.priceAmount
    if (updates.pricingModel !== undefined) patch.pricing_model = updates.pricingModel
    if (updates.tags         !== undefined) patch.tags          = updates.tags

    const { error } = await supabaseAdmin
      .from('creator_content')
      .update(patch)
      .eq('id', contentId)
      .eq('creator_id', creatorId)

    if (error) throw new Error(error.message)
  }

  // ── Purchases ─────────────────────────────────────────────────────────────

  async recordPurchase(params: {
    contentId:   string
    buyerId:     string
    amountPaid:  number
    currency:    string
    paymentRef:  string
    affiliateCode?: string
  }): Promise<{ royaltyAmount: number; coinsEarned: number }> {
    const { contentId, buyerId, amountPaid, currency, paymentRef, affiliateCode } = params

    // Resolve affiliate
    let affiliateId: string | null = null
    let commissionAmount = 0
    if (affiliateCode) {
      const { data: link } = await supabaseAdmin
        .from('affiliate_links')
        .select('id, creator_id, commission_pct')
        .eq('code', affiliateCode)
        .eq('content_id', contentId)
        .single()

      if (link) {
        affiliateId      = link.creator_id
        commissionAmount = amountPaid * (link.commission_pct / 100)
      }
    }

    const platformFee  = amountPaid * PLATFORM_FEE_PCT
    const royaltyAmount = amountPaid - platformFee - commissionAmount

    const { error } = await supabaseAdmin
      .from('content_purchases')
      .insert({
        content_id:    contentId,
        buyer_id:      buyerId,
        amount_paid:   amountPaid,
        currency,
        payment_ref:   paymentRef,
        affiliate_id:  affiliateId,
        royalty_paid:  royaltyAmount,
      })

    if (error) throw new Error(error.message)

    // Update content stats
    const { data: content } = await supabaseAdmin
      .from('creator_content')
      .select('purchase_count, total_earned, creator_id')
      .eq('id', contentId)
      .single()

    if (content) {
      await supabaseAdmin
        .from('creator_content')
        .update({
          purchase_count: (content.purchase_count ?? 0) + 1,
          total_earned:   (content.total_earned ?? 0) + royaltyAmount,
        })
        .eq('id', contentId)

      // Add royalty to creator's pending payout pool
      await this.accruePayout(content.creator_id, royaltyAmount, currency)
    }

    // Pay affiliate commission
    if (affiliateId && commissionAmount > 0) {
      await this.accruePayout(affiliateId, commissionAmount, currency)

      // Update affiliate link stats
      await supabaseAdmin.rpc('increment_affiliate_conversion', {
        p_code: affiliateCode, p_earned: commissionAmount,
      })
    }

    const coinsEarned = Math.floor(amountPaid * COIN_PER_NAIRA * 0.01) // 1% back in coins

    return { royaltyAmount, coinsEarned }
  }

  async hasPurchased(contentId: string, userId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('content_purchases')
      .select('id')
      .eq('content_id', contentId)
      .eq('buyer_id', userId)
      .maybeSingle()
    return !!data
  }

  // ── Tips ──────────────────────────────────────────────────────────────────

  async recordTip(params: {
    contentId: string; tipperId: string
    amount: number; currency: string
    message?: string; paymentRef: string
  }): Promise<{ coinsEarned: number }> {
    const { contentId, tipperId, amount, currency, message, paymentRef } = params

    const { error } = await supabaseAdmin
      .from('content_tips')
      .insert({ content_id: contentId, tipper_id: tipperId, amount, currency, message: message ?? null, payment_ref: paymentRef })

    if (error) throw new Error(error.message)

    // 90% to creator
    const { data: content } = await supabaseAdmin
      .from('creator_content')
      .select('creator_id, total_earned')
      .eq('id', contentId)
      .single()

    if (content) {
      const creatorShare = amount * 0.9
      await this.accruePayout(content.creator_id, creatorShare, currency)
      await supabaseAdmin
        .from('creator_content')
        .update({ total_earned: (content.total_earned ?? 0) + creatorShare })
        .eq('id', contentId)
    }

    const coinsEarned = Math.floor(amount * COIN_PER_NAIRA * 0.02) // 2% back in coins for tipping
    return { coinsEarned }
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async subscribe(params: {
    subscriberId: string; creatorId: string
    plan: 'monthly' | 'yearly'; amount: number; currency: string; paymentRef: string
  }): Promise<void> {
    const { subscriberId, creatorId, plan, amount, currency, paymentRef } = params

    const now     = new Date()
    const expires = new Date(now)
    if (plan === 'monthly') expires.setMonth(expires.getMonth() + 1)
    else expires.setFullYear(expires.getFullYear() + 1)

    const { error } = await supabaseAdmin
      .from('creator_subscriptions')
      .upsert({
        subscriber_id: subscriberId,
        creator_id:    creatorId,
        plan,
        amount,
        currency,
        status:        'active',
        started_at:    now.toISOString(),
        expires_at:    expires.toISOString(),
        payment_ref:   paymentRef,
      }, { onConflict: 'subscriber_id,creator_id' })

    if (error) throw new Error(error.message)

    const creatorShare = amount * (1 - PLATFORM_FEE_PCT)
    await this.accruePayout(creatorId, creatorShare, currency)
  }

  async cancelSubscription(subscriberId: string, creatorId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('creator_subscriptions')
      .update({ status: 'cancelled' })
      .eq('subscriber_id', subscriberId)
      .eq('creator_id', creatorId)

    if (error) throw new Error(error.message)
  }

  async checkSubscription(subscriberId: string, creatorId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('creator_subscriptions')
      .select('id, expires_at')
      .eq('subscriber_id', subscriberId)
      .eq('creator_id', creatorId)
      .eq('status', 'active')
      .single()

    if (!data) return false
    return new Date(data.expires_at) > new Date()
  }

  // ── Affiliate Links ───────────────────────────────────────────────────────

  async createAffiliateLink(creatorId: string, contentId: string, commissionPct = 5): Promise<{ code: string; link: string }> {
    const code = nanoid(10)

    const { error } = await supabaseAdmin
      .from('affiliate_links')
      .insert({
        creator_id:       creatorId,
        content_id:       contentId,
        code,
        commission_pct:   commissionPct,
        click_count:      0,
        conversion_count: 0,
        total_earned:     0,
      })

    if (error) throw new Error(error.message)

    const link = `${process.env.APP_BASE_URL}/c/${contentId}?ref=${code}`
    return { code, link }
  }

  async trackAffiliateClick(code: string) {
    await supabaseAdmin.rpc('increment_affiliate_click', { p_code: code })
  }

  // ── Creator Dashboard ─────────────────────────────────────────────────────

  async creatorStats(creatorId: string): Promise<{
    totalEarned:      number
    pendingPayout:    number
    totalViews:       number
    totalPurchases:   number
    contentCount:     number
    subscriberCount:  number
    topContent:       Array<{ id: string; title: string; views: number; earned: number }>
  }> {
    const [
      { data: content },
      { data: payout },
      { data: subs },
    ] = await Promise.all([
      supabaseAdmin
        .from('creator_content')
        .select('id, title, view_count, purchase_count, total_earned')
        .eq('creator_id', creatorId),
      supabaseAdmin
        .from('creator_payouts')
        .select('amount')
        .eq('creator_id', creatorId)
        .eq('status', 'pending'),
      supabaseAdmin
        .from('creator_subscriptions')
        .select('id')
        .eq('creator_id', creatorId)
        .eq('status', 'active'),
    ])

    const totalEarned    = (content ?? []).reduce((s, c) => s + (c.total_earned ?? 0), 0)
    const pendingPayout  = (payout ?? []).reduce((s, p) => s + (p.amount ?? 0), 0)
    const totalViews     = (content ?? []).reduce((s, c) => s + (c.view_count ?? 0), 0)
    const totalPurchases = (content ?? []).reduce((s, c) => s + (c.purchase_count ?? 0), 0)

    const topContent = [...(content ?? [])]
      .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
      .slice(0, 5)
      .map(c => ({ id: c.id, title: c.title, views: c.view_count ?? 0, earned: c.total_earned ?? 0 }))

    return {
      totalEarned,
      pendingPayout,
      totalViews,
      totalPurchases,
      contentCount:    (content ?? []).length,
      subscriberCount: (subs ?? []).length,
      topContent,
    }
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  async requestPayout(creatorId: string, amount: number, currency: string, bankRef: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('creator_payouts')
      .insert({
        creator_id:   creatorId,
        amount,
        currency,
        status:       'pending',
        payout_ref:   bankRef,
        period_start: new Date().toISOString(),
        period_end:   new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return data.id
  }

  async payoutHistory(creatorId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('creator_payouts')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)
    return data
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async accruePayout(creatorId: string, amount: number, currency: string) {
    // Upsert into a running "current period" pending payout
    const { data: existing } = await supabaseAdmin
      .from('creator_payouts')
      .select('id, amount')
      .eq('creator_id', creatorId)
      .eq('status', 'pending')
      .eq('currency', currency)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      await supabaseAdmin
        .from('creator_payouts')
        .update({ amount: (existing.amount ?? 0) + amount })
        .eq('id', existing.id)
    } else {
      await supabaseAdmin
        .from('creator_payouts')
        .insert({
          creator_id:   creatorId,
          amount,
          currency,
          status:       'pending',
          period_start: new Date().toISOString(),
          period_end:   new Date().toISOString(),
        })
    }
  }
}

export const creatorEconomyService = new CreatorEconomyService()
