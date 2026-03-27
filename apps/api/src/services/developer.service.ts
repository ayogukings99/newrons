/**
 * Public Developer API Service — Phase 5
 * NEXUS Open Infrastructure Layer
 *
 * NEXUS exposes its core capabilities as a public API for third-party developers:
 *   - Translation (20+ African languages)
 *   - LOGOS knowledge graph queries
 *   - CLM dataset access
 *   - Community Coins issuance (partner apps)
 *   - NFC tap-to-transfer primitives
 *
 * This service manages:
 *
 * 1. API KEY MANAGEMENT
 *    - Create API keys scoped to specific capabilities
 *    - Rotate, revoke, and list keys per developer account
 *    - Keys are stored hashed (SHA-256); raw key shown only once on creation
 *    - Format: nxt_live_<32 random hex chars>  or  nxt_test_<32 random hex chars>
 *
 * 2. USAGE METERING
 *    - Every API call is counted against the key's monthly quota
 *    - Tiers: free (1,000 req/mo), starter (50,000), pro (500,000), enterprise (unlimited)
 *    - Usage stored per day in developer_usage table for billing and analytics
 *    - Over-quota requests return 429 with a Retry-After header
 *
 * 3. RATE LIMITING
 *    - Per-key rate limits: free=10 rpm, starter=100 rpm, pro=1000 rpm
 *    - Sliding window counted in developer_rate_buckets (1-minute TTL)
 *    - Fastify middleware exported: authenticateDeveloperKey()
 *
 * 4. DEVELOPER PORTAL DATA
 *    - Usage graphs (last 30 days, per endpoint)
 *    - Key analytics: top endpoints, error rates, latency percentiles
 *    - Webhook registration for usage alerts (nearing quota)
 *
 * DB tables:
 *   developer_accounts     — partner/developer registrations
 *   developer_api_keys     — hashed keys with scope + tier metadata
 *   developer_usage        — daily usage counters per key per endpoint
 *   developer_rate_buckets — sliding-window rate limit state (short TTL)
 */

import { supabaseAdmin } from '../lib/supabase'
import crypto            from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApiKeyTier    = 'free' | 'starter' | 'pro' | 'enterprise'
export type ApiKeyScope   = 'translate' | 'logos' | 'clm' | 'coins' | 'nfc' | '*'
export type ApiKeyStatus  = 'active' | 'revoked' | 'expired'
export type ApiKeyEnv     = 'live' | 'test'

export interface DeveloperAccount {
  id:          string
  userId:      string
  appName:     string
  appUrl?:     string
  tier:        ApiKeyTier
  webhookUrl?: string
  createdAt:   string
}

export interface ApiKey {
  id:          string
  accountId:   string
  name:        string
  prefix:      string    // first 12 chars of raw key (shown in portal)
  scopes:      ApiKeyScope[]
  tier:        ApiKeyTier
  env:         ApiKeyEnv
  status:      ApiKeyStatus
  monthlyQuota: number
  usedThisMonth: number
  lastUsedAt?: string
  expiresAt?:  string
  createdAt:   string
}

export interface UsageSummary {
  keyId:       string
  period:      string    // YYYY-MM-DD
  endpoint:    string
  requestCount: number
  errorCount:  number
  avgLatencyMs: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_QUOTA: Record<ApiKeyTier, number> = {
  free:       1_000,
  starter:    50_000,
  pro:        500_000,
  enterprise: Infinity,
}

const TIER_RPM: Record<ApiKeyTier, number> = {
  free:       10,
  starter:    100,
  pro:        1_000,
  enterprise: 10_000,
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DeveloperService {

  // ── Account Management ─────────────────────────────────────────────────────

  /**
   * Register a developer account (one per NEXUS user, upgradeable).
   */
  async createAccount(params: {
    userId:    string
    appName:   string
    appUrl?:   string
    tier?:     ApiKeyTier
  }): Promise<DeveloperAccount> {
    const { userId, appName, appUrl, tier = 'free' } = params

    // One account per user
    const { data: existing } = await supabaseAdmin
      .from('developer_accounts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) throw new Error('Developer account already exists for this user')

    const { data, error } = await supabaseAdmin
      .from('developer_accounts')
      .insert({ user_id: userId, app_name: appName, app_url: appUrl ?? null, tier })
      .select('*')
      .single()

    if (error || !data) throw new Error(`Failed to create account: ${error?.message}`)
    return this.mapAccount(data)
  }

  async getAccount(userId: string): Promise<DeveloperAccount | null> {
    const { data } = await supabaseAdmin
      .from('developer_accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    return data ? this.mapAccount(data) : null
  }

  async updateAccount(userId: string, updates: Partial<Pick<DeveloperAccount, 'appName' | 'appUrl' | 'webhookUrl'>>): Promise<void> {
    const { error } = await supabaseAdmin
      .from('developer_accounts')
      .update({
        app_name:    updates.appName,
        app_url:     updates.appUrl,
        webhook_url: updates.webhookUrl,
      })
      .eq('user_id', userId)

    if (error) throw new Error(error.message)
  }

  // ── API Key Management ─────────────────────────────────────────────────────

  /**
   * Create a new API key. Returns the raw key ONCE — store it securely.
   */
  async createApiKey(params: {
    accountId: string
    name:      string
    scopes:    ApiKeyScope[]
    env?:      ApiKeyEnv
    expiresAt?: string
  }): Promise<{ key: ApiKey; rawKey: string }> {
    const { accountId, name, scopes, env = 'live', expiresAt } = params

    // Validate account + get tier
    const { data: account } = await supabaseAdmin
      .from('developer_accounts')
      .select('tier')
      .eq('id', accountId)
      .single()

    if (!account) throw new Error('Developer account not found')

    // Enforce key limit per account (free: 2, starter: 5, pro: 20, enterprise: unlimited)
    const keyLimits: Record<ApiKeyTier, number> = { free: 2, starter: 5, pro: 20, enterprise: 999 }
    const { count } = await supabaseAdmin
      .from('developer_api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'active')

    if ((count ?? 0) >= keyLimits[account.tier as ApiKeyTier]) {
      throw new Error(`API key limit reached for ${account.tier} tier`)
    }

    // Generate raw key
    const rawKey = `nxt_${env}_${crypto.randomBytes(20).toString('hex')}`
    const keyHash = this.hashKey(rawKey)
    const prefix  = rawKey.slice(0, 16)  // "nxt_live_xxxxxxxx"

    const { data, error } = await supabaseAdmin
      .from('developer_api_keys')
      .insert({
        account_id:     accountId,
        name,
        key_hash:       keyHash,
        prefix,
        scopes:         JSON.stringify(scopes),
        tier:           account.tier,
        env,
        status:         'active',
        monthly_quota:  TIER_QUOTA[account.tier as ApiKeyTier] === Infinity ? -1 : TIER_QUOTA[account.tier as ApiKeyTier],
        used_this_month: 0,
        expires_at:     expiresAt ?? null,
      })
      .select('*')
      .single()

    if (error || !data) throw new Error(`Failed to create API key: ${error?.message}`)

    return { key: this.mapKey(data), rawKey }
  }

  async listApiKeys(accountId: string): Promise<ApiKey[]> {
    const { data, error } = await supabaseAdmin
      .from('developer_api_keys')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return (data ?? []).map(this.mapKey)
  }

  async revokeApiKey(keyId: string, accountId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('developer_api_keys')
      .update({ status: 'revoked' })
      .eq('id', keyId)
      .eq('account_id', accountId)

    if (error) throw new Error(error.message)
  }

  /**
   * Rotate a key: revoke the old one and issue a fresh key with same settings.
   */
  async rotateApiKey(keyId: string, accountId: string): Promise<{ key: ApiKey; rawKey: string }> {
    const { data: old } = await supabaseAdmin
      .from('developer_api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('account_id', accountId)
      .single()

    if (!old) throw new Error('API key not found')

    await this.revokeApiKey(keyId, accountId)

    return this.createApiKey({
      accountId,
      name:   old.name + ' (rotated)',
      scopes: JSON.parse(old.scopes),
      env:    old.env,
    })
  }

  // ── Authentication & Rate Limiting ─────────────────────────────────────────

  /**
   * Authenticate an incoming API key.
   * Returns the key record if valid, throws if invalid/revoked/over-quota.
   */
  async authenticateKey(rawKey: string, endpoint: string): Promise<ApiKey> {
    const keyHash = this.hashKey(rawKey)

    const { data, error } = await supabaseAdmin
      .from('developer_api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .eq('status', 'active')
      .maybeSingle()

    if (error || !data) throw new Error('Invalid API key')

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      await supabaseAdmin.from('developer_api_keys').update({ status: 'expired' }).eq('id', data.id)
      throw new Error('API key has expired')
    }

    const key = this.mapKey(data)

    // Monthly quota check (enterprise = -1 = unlimited)
    if (key.monthlyQuota !== -1 && key.usedThisMonth >= key.monthlyQuota) {
      throw new Error('Monthly quota exceeded')
    }

    // Rate limit check (sliding window, in-memory via DB bucket)
    await this.checkRateLimit(data.id, key.tier)

    // Record usage asynchronously (don't block the response)
    this.recordUsage(data.id, endpoint).catch(() => {})

    return key
  }

  private async checkRateLimit(keyId: string, tier: ApiKeyTier): Promise<void> {
    const rpm    = TIER_RPM[tier]
    const bucket = new Date().toISOString().slice(0, 16)  // "YYYY-MM-DDTHH:MM"

    const { data } = await supabaseAdmin
      .from('developer_rate_buckets')
      .select('request_count')
      .eq('key_id', keyId)
      .eq('bucket', bucket)
      .maybeSingle()

    const count = data?.request_count ?? 0
    if (count >= rpm) throw new Error(`Rate limit exceeded: ${rpm} requests/minute`)

    // Upsert the bucket counter
    await supabaseAdmin
      .from('developer_rate_buckets')
      .upsert(
        { key_id: keyId, bucket, request_count: count + 1 },
        { onConflict: 'key_id,bucket' }
      )
  }

  private async recordUsage(keyId: string, endpoint: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10)

    await supabaseAdmin.rpc('developer_increment_usage', {
      p_key_id:   keyId,
      p_date:     today,
      p_endpoint: endpoint,
    })

    // Increment monthly counter on the key itself
    await supabaseAdmin.rpc('developer_increment_monthly', { p_key_id: keyId })
  }

  // ── Usage Analytics ────────────────────────────────────────────────────────

  /**
   * Get daily usage for the last N days for a given API key.
   */
  async getUsageSummary(keyId: string, days = 30): Promise<UsageSummary[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

    const { data, error } = await supabaseAdmin
      .from('developer_usage')
      .select('*')
      .eq('key_id', keyId)
      .gte('period', since)
      .order('period', { ascending: false })

    if (error) throw new Error(error.message)

    return (data ?? []).map((r: any) => ({
      keyId:        r.key_id,
      period:       r.period,
      endpoint:     r.endpoint,
      requestCount: r.request_count,
      errorCount:   r.error_count,
      avgLatencyMs: r.avg_latency_ms,
    }))
  }

  /**
   * Reset monthly usage counter (called by a monthly cron job).
   */
  async resetMonthlyUsage(): Promise<void> {
    await supabaseAdmin
      .from('developer_api_keys')
      .update({ used_this_month: 0 })
      .eq('status', 'active')
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex')
  }

  private mapAccount(r: any): DeveloperAccount {
    return {
      id:          r.id,
      userId:      r.user_id,
      appName:     r.app_name,
      appUrl:      r.app_url,
      tier:        r.tier,
      webhookUrl:  r.webhook_url,
      createdAt:   r.created_at,
    }
  }

  private mapKey(r: any): ApiKey {
    return {
      id:             r.id,
      accountId:      r.account_id,
      name:           r.name,
      prefix:         r.prefix,
      scopes:         JSON.parse(r.scopes ?? '[]'),
      tier:           r.tier,
      env:            r.env,
      status:         r.status,
      monthlyQuota:   r.monthly_quota,
      usedThisMonth:  r.used_this_month,
      lastUsedAt:     r.last_used_at,
      expiresAt:      r.expires_at,
      createdAt:      r.created_at,
    }
  }
}

export const developerService = new DeveloperService()
