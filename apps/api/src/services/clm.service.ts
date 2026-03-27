/**
 * Community Language Model (CLM) Service — Phase 5
 * The NEXUS African Language Model Initiative
 *
 * "Built for Africa. Built by Africa. Built in Africa's voice."
 *
 * The CLM is the community-owned African language AI layer. Unlike commercial
 * language models that underrepresent African languages, the CLM is:
 *   - Built from data contributed directly by African communities
 *   - Governed by the NEXUS DAO (dataset curation, model updates, royalties)
 *   - Rewarded: contributors earn Community Coins for validated contributions
 *   - Federated: any partner institution can run a training node
 *
 * This service manages the full contribution lifecycle:
 *
 * 1. DATA CONTRIBUTION
 *    - Text contributions: sentences, paragraphs, stories, proverbs in any supported language
 *    - Audio contributions: voice recordings of text (for speech models)
 *    - Translation pairs: parallel sentence pairs across language pairs
 *    - Each contribution is tagged with language, dialect, domain, speaker age range
 *
 * 2. COMMUNITY VALIDATION
 *    - Each contribution goes through a peer review queue
 *    - 3 independent validators must approve (or reject) each contribution
 *    - Validators stake a small CLM_STAKE of Community Coins; correct votes earn rewards
 *    - Spam/low-quality contributions burn the submitter's stake
 *
 * 3. DATASET MANAGEMENT
 *    - Validated contributions are added to the CLM training dataset
 *    - Dataset is versioned; each version is anchored on Solana via memo
 *    - Dataset stats: per-language token counts, speaker demographics, domain distribution
 *
 * 4. CONTRIBUTOR REWARDS
 *    - Accepted text:   +5  Community Coins per validated contribution
 *    - Accepted audio:  +15 Community Coins per validated recording
 *    - Accepted pair:   +8  Community Coins per validated translation pair
 *    - Validator reward: +2 Community Coins per correct validation vote
 *    - Validator penalty: -1 Community Coin per incorrect validation vote
 *
 * DB tables:
 *   clm_contributions      — raw submitted contributions
 *   clm_validations        — peer review votes per contribution
 *   clm_dataset_versions   — versioned snapshots of the training dataset
 *   clm_contributor_stats  — per-user contribution + earnings summary
 *
 * Integration:
 *   - Community Coins rewards via user_coin_balances (existing table)
 *   - DAO: dataset version updates go through DAO proposal
 *   - Solana memo: dataset version hash anchored on-chain
 */

import { supabaseAdmin } from '../lib/supabase'
import { solanaService }  from './solana.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContributionType  = 'text' | 'audio' | 'translation_pair'
export type ContributionDomain = 'general' | 'proverb' | 'story' | 'news' | 'legal' | 'medical' | 'agriculture' | 'tech' | 'religion' | 'music'
export type ContributionStatus = 'pending' | 'validating' | 'accepted' | 'rejected'
export type ValidationVote     = 'approve' | 'reject'

export type SupportedCLMLang =
  | 'yo' | 'ig' | 'ha' | 'pcm' | 'sw' | 'zu' | 'am' | 'so'
  | 'xh' | 'af' | 'ar' | 'fr' | 'pt' | 'tw' | 'ee' | 'ak'
  | 'sn' | 'rw' | 'ln' | 'mg' | 'bm' | 'ff'  // Twi, Ewe, Akan, Shona, Kinyarwanda, Lingala, Malagasy, Bambara, Fula

export interface CLMContribution {
  id:             string
  contributorId:  string
  type:           ContributionType
  languageCode:   SupportedCLMLang
  dialectTag?:    string           // e.g. "Lagos Yoruba", "Kano Hausa"
  domain:         ContributionDomain
  content:        string           // text content or audio storage key
  targetContent?: string           // paired target for translation_pair type
  targetLang?:    SupportedCLMLang // target language for translation_pair
  charCount?:     number
  durationSecs?:  number           // for audio
  status:         ContributionStatus
  validationCount: number
  approveCount:   number
  rejectCount:    number
  coinsEarned:    number
  createdAt:      string
}

export interface CLMValidation {
  id:             string
  contributionId: string
  validatorId:    string
  vote:           ValidationVote
  reason?:        string
  coinsEarned:    number
  createdAt:      string
}

export interface DatasetStats {
  totalContributions:  number
  acceptedCount:       number
  totalTokens:         number
  byLanguage:          Record<string, { count: number; tokens: number }>
  byDomain:            Record<string, number>
  uniqueContributors:  number
  lastVersionAt?:      string
}

export interface ContributorStats {
  userId:          string
  totalSubmitted:  number
  totalAccepted:   number
  totalRejected:   number
  totalValidated:  number
  totalCoinsEarned: number
  topLanguages:    SupportedCLMLang[]
  rank?:           number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALIDATIONS_NEEDED   = 3     // votes required to settle a contribution
const COINS_TEXT           = 5
const COINS_AUDIO          = 15
const COINS_PAIR           = 8
const COINS_VALIDATOR_WIN  = 2
const COINS_VALIDATOR_LOSS = -1

// Rough token estimate: 1 token ≈ 4 chars for African languages
const TOKENS_PER_CHAR = 0.25

// ── Service ───────────────────────────────────────────────────────────────────

export class CLMService {

  // ── Data Contribution ──────────────────────────────────────────────────────

  /**
   * Submit a new language data contribution.
   * Content is lightly validated before entering the review queue.
   */
  async submitContribution(params: {
    contributorId: string
    type:          ContributionType
    languageCode:  SupportedCLMLang
    domain:        ContributionDomain
    content:       string
    dialectTag?:   string
    targetContent?: string
    targetLang?:   SupportedCLMLang
    durationSecs?: number
  }): Promise<{ contributionId: string }> {
    const {
      contributorId, type, languageCode, domain,
      content, dialectTag, targetContent, targetLang, durationSecs,
    } = params

    // Basic content quality gate
    if (type === 'text' && content.trim().length < 20) {
      throw new Error('Text contributions must be at least 20 characters')
    }
    if (type === 'translation_pair' && (!targetContent || !targetLang)) {
      throw new Error('Translation pairs require targetContent and targetLang')
    }
    if (type === 'audio' && !durationSecs) {
      throw new Error('Audio contributions require durationSecs')
    }

    // Duplicate check: same contributor + same content in same language
    const contentHash = this.hashContent(content)
    const { data: existing } = await supabaseAdmin
      .from('clm_contributions')
      .select('id')
      .eq('contributor_id', contributorId)
      .eq('content_hash', contentHash)
      .eq('language_code', languageCode)
      .maybeSingle()

    if (existing) throw new Error('You have already submitted this content')

    const charCount = content.length

    const { data, error } = await supabaseAdmin
      .from('clm_contributions')
      .insert({
        contributor_id:   contributorId,
        type,
        language_code:    languageCode,
        dialect_tag:      dialectTag ?? null,
        domain,
        content,
        content_hash:     contentHash,
        target_content:   targetContent ?? null,
        target_lang:      targetLang ?? null,
        char_count:       charCount,
        duration_secs:    durationSecs ?? null,
        status:           'pending',
        validation_count: 0,
        approve_count:    0,
        reject_count:     0,
        coins_earned:     0,
      })
      .select('id')
      .single()

    if (error || !data) throw new Error(`Failed to submit contribution: ${error?.message}`)

    return { contributionId: data.id }
  }

  /**
   * Get contributions pending validation (for the review queue).
   * Excludes contributions already validated by this validator.
   */
  async getPendingForValidation(params: {
    validatorId:   string
    languageCode?: SupportedCLMLang
    domain?:       ContributionDomain
    limit?:        number
  }): Promise<CLMContribution[]> {
    const { validatorId, languageCode, domain, limit = 10 } = params

    // Get contribution IDs already voted on by this validator
    const { data: alreadyVoted } = await supabaseAdmin
      .from('clm_validations')
      .select('contribution_id')
      .eq('validator_id', validatorId)

    const excludeIds = (alreadyVoted ?? []).map((r: any) => r.contribution_id)

    let q = supabaseAdmin
      .from('clm_contributions')
      .select('*')
      .neq('contributor_id', validatorId)   // can't validate own contributions
      .in('status', ['pending', 'validating'])
      .order('created_at', { ascending: true })
      .limit(limit)

    if (excludeIds.length > 0) q = q.not('id', 'in', `(${excludeIds.map(id => `'${id}'`).join(',')})`)
    if (languageCode) q = q.eq('language_code', languageCode)
    if (domain)       q = q.eq('domain', domain)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    return (data ?? []).map(this.mapContribution)
  }

  // ── Community Validation ───────────────────────────────────────────────────

  /**
   * Cast a validation vote on a contribution.
   * Automatically settles the contribution if quorum is reached.
   */
  async castValidationVote(params: {
    validatorId:    string
    contributionId: string
    vote:           ValidationVote
    reason?:        string
  }): Promise<{ settled: boolean; finalStatus?: ContributionStatus }> {
    const { validatorId, contributionId, vote, reason } = params

    // Fetch contribution
    const { data: contrib, error: cErr } = await supabaseAdmin
      .from('clm_contributions')
      .select('*')
      .eq('id', contributionId)
      .single()

    if (cErr || !contrib) throw new Error('Contribution not found')
    if (contrib.status === 'accepted' || contrib.status === 'rejected') {
      throw new Error('This contribution has already been settled')
    }
    if (contrib.contributor_id === validatorId) {
      throw new Error('You cannot validate your own contribution')
    }

    // Check not already voted
    const { data: prev } = await supabaseAdmin
      .from('clm_validations')
      .select('id')
      .eq('contribution_id', contributionId)
      .eq('validator_id', validatorId)
      .maybeSingle()

    if (prev) throw new Error('You have already voted on this contribution')

    // Record the vote
    await supabaseAdmin
      .from('clm_validations')
      .insert({
        contribution_id: contributionId,
        validator_id:    validatorId,
        vote,
        reason:          reason ?? null,
        coins_earned:    0,  // computed on settlement
      })

    // Update counts
    const newApprove = contrib.approve_count + (vote === 'approve' ? 1 : 0)
    const newReject  = contrib.reject_count  + (vote === 'reject'  ? 1 : 0)
    const newTotal   = contrib.validation_count + 1

    // Check if quorum reached
    const settled = newTotal >= VALIDATIONS_NEEDED
    let finalStatus: ContributionStatus | undefined

    if (settled) {
      finalStatus = newApprove > newReject ? 'accepted' : 'rejected'
      await this.settleContribution(contributionId, contrib, finalStatus, newApprove, newReject)
    } else {
      await supabaseAdmin
        .from('clm_contributions')
        .update({
          status:           'validating',
          validation_count: newTotal,
          approve_count:    newApprove,
          reject_count:     newReject,
        })
        .eq('id', contributionId)
    }

    return { settled, finalStatus }
  }

  /**
   * Settle a contribution: assign final status, pay contributor + validators.
   */
  private async settleContribution(
    contributionId: string,
    contrib: any,
    finalStatus:    ContributionStatus,
    approveCount:   number,
    rejectCount:    number,
  ): Promise<void> {
    const accepted = finalStatus === 'accepted'

    // Coins for contributor
    let contributorCoins = 0
    if (accepted) {
      if (contrib.type === 'text')             contributorCoins = COINS_TEXT
      else if (contrib.type === 'audio')       contributorCoins = COINS_AUDIO
      else if (contrib.type === 'translation_pair') contributorCoins = COINS_PAIR
    }

    // Update contribution
    await supabaseAdmin
      .from('clm_contributions')
      .update({
        status:           finalStatus,
        validation_count: approveCount + rejectCount,
        approve_count:    approveCount,
        reject_count:     rejectCount,
        coins_earned:     contributorCoins,
      })
      .eq('id', contributionId)

    // Pay contributor
    if (contributorCoins > 0) {
      await this.addCoins(contrib.contributor_id, contributorCoins, `CLM contribution accepted: ${contributionId}`)
    }

    // Pay validators
    const { data: validations } = await supabaseAdmin
      .from('clm_validations')
      .select('*')
      .eq('contribution_id', contributionId)

    const winVote: ValidationVote = accepted ? 'approve' : 'reject'

    for (const v of validations ?? []) {
      const correct = v.vote === winVote
      const coins   = correct ? COINS_VALIDATOR_WIN : COINS_VALIDATOR_LOSS

      await supabaseAdmin
        .from('clm_validations')
        .update({ coins_earned: coins })
        .eq('id', v.id)

      await this.addCoins(v.validator_id, coins, `CLM validation ${correct ? 'correct' : 'incorrect'}: ${contributionId}`)
    }

    // If accepted, estimate tokens and update dataset stats
    if (accepted) {
      const tokens = Math.round(contrib.char_count * TOKENS_PER_CHAR)
      await supabaseAdmin.rpc('clm_increment_dataset_stats', {
        p_language: contrib.language_code,
        p_domain:   contrib.domain,
        p_tokens:   tokens,
      })
    }
  }

  // ── Dataset Management ─────────────────────────────────────────────────────

  /**
   * Get overall dataset statistics.
   */
  async getDatasetStats(): Promise<DatasetStats> {
    const { data: totals } = await supabaseAdmin
      .rpc('clm_dataset_totals')

    const { data: byLang } = await supabaseAdmin
      .from('clm_dataset_stats')
      .select('language_code, contribution_count, token_count')

    const { data: byDomain } = await supabaseAdmin
      .from('clm_contributions')
      .select('domain')
      .eq('status', 'accepted')

    const { data: lastVersion } = await supabaseAdmin
      .from('clm_dataset_versions')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: contributors } = await supabaseAdmin
      .from('clm_contributions')
      .select('contributor_id')
      .eq('status', 'accepted')

    const uniqueContributors = new Set((contributors ?? []).map((r: any) => r.contributor_id)).size

    const langMap: Record<string, { count: number; tokens: number }> = {}
    for (const l of byLang ?? []) {
      langMap[l.language_code] = { count: l.contribution_count, tokens: l.token_count }
    }

    const domainMap: Record<string, number> = {}
    for (const d of byDomain ?? []) {
      domainMap[d.domain] = (domainMap[d.domain] ?? 0) + 1
    }

    const t = totals?.[0] ?? {}
    return {
      totalContributions:  t.total_contributions ?? 0,
      acceptedCount:       t.accepted_count      ?? 0,
      totalTokens:         t.total_tokens        ?? 0,
      byLanguage:          langMap,
      byDomain:            domainMap,
      uniqueContributors,
      lastVersionAt:       lastVersion?.created_at,
    }
  }

  /**
   * Create a new dataset version snapshot. Called via DAO proposal execution.
   * Anchors the version hash on Solana via memo.
   */
  async createDatasetVersion(params: {
    createdBy:    string
    versionLabel: string
    notes?:       string
  }): Promise<{ versionId: string; solanaSignature?: string }> {
    const { createdBy, versionLabel, notes } = params

    const stats = await this.getDatasetStats()
    const versionHash = this.hashContent(JSON.stringify({ versionLabel, stats, ts: new Date().toISOString() }))

    const { data, error } = await supabaseAdmin
      .from('clm_dataset_versions')
      .insert({
        created_by:    createdBy,
        version_label: versionLabel,
        version_hash:  versionHash,
        notes:         notes ?? null,
        stats:         JSON.stringify(stats),
      })
      .select('id')
      .single()

    if (error || !data) throw new Error(`Failed to create dataset version: ${error?.message}`)

    // Anchor on Solana
    let solanaSignature: string | undefined
    try {
      solanaSignature = await solanaService.anchorMemo(
        `NEXUS CLM v${versionLabel} hash:${versionHash.slice(0, 16)}`
      )
    } catch { /* Non-fatal */ }

    return { versionId: data.id, solanaSignature }
  }

  /**
   * List dataset versions (public).
   */
  async listDatasetVersions(limit = 20): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('clm_dataset_versions')
      .select('id, version_label, version_hash, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(error.message)
    return data ?? []
  }

  // ── Contributor Stats ──────────────────────────────────────────────────────

  async getContributorStats(userId: string): Promise<ContributorStats> {
    const { data } = await supabaseAdmin
      .rpc('clm_contributor_stats', { p_user_id: userId })

    const r = data?.[0] ?? {}

    // Top languages by contribution count
    const { data: langRows } = await supabaseAdmin
      .from('clm_contributions')
      .select('language_code')
      .eq('contributor_id', userId)
      .eq('status', 'accepted')

    const langCount: Record<string, number> = {}
    for (const l of langRows ?? []) {
      langCount[l.language_code] = (langCount[l.language_code] ?? 0) + 1
    }
    const topLanguages = Object.entries(langCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code]) => code as SupportedCLMLang)

    return {
      userId,
      totalSubmitted:   r.total_submitted   ?? 0,
      totalAccepted:    r.total_accepted     ?? 0,
      totalRejected:    r.total_rejected     ?? 0,
      totalValidated:   r.total_validated    ?? 0,
      totalCoinsEarned: r.total_coins_earned ?? 0,
      topLanguages,
    }
  }

  /**
   * Global leaderboard of top CLM contributors.
   */
  async getLeaderboard(limit = 50): Promise<{ rank: number; userId: string; coinsEarned: number; acceptedCount: number }[]> {
    const { data, error } = await supabaseAdmin
      .rpc('clm_leaderboard', { p_limit: limit })

    if (error) throw new Error(error.message)

    return (data ?? []).map((r: any, i: number) => ({
      rank:          i + 1,
      userId:        r.contributor_id,
      coinsEarned:   r.total_coins,
      acceptedCount: r.accepted_count,
    }))
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async addCoins(userId: string, amount: number, note: string): Promise<void> {
    if (amount === 0) return

    if (amount > 0) {
      await supabaseAdmin.rpc('increment_community_coins', {
        p_user_id: userId,
        p_amount:  amount,
        p_note:    note,
      })
    } else {
      // Deduct (ensure non-negative)
      await supabaseAdmin.rpc('decrement_community_coins_safe', {
        p_user_id: userId,
        p_amount:  Math.abs(amount),
        p_note:    note,
      })
    }
  }

  private hashContent(content: string): string {
    // Simple djb2 hash — sufficient for dedup (not cryptographic)
    let h = 5381
    for (let i = 0; i < content.length; i++) {
      h = ((h << 5) + h) + content.charCodeAt(i)
      h = h & h  // convert to 32-bit
    }
    return Math.abs(h).toString(16).padStart(8, '0')
  }

  private mapContribution(r: any): CLMContribution {
    return {
      id:              r.id,
      contributorId:   r.contributor_id,
      type:            r.type,
      languageCode:    r.language_code,
      dialectTag:      r.dialect_tag,
      domain:          r.domain,
      content:         r.content,
      targetContent:   r.target_content,
      targetLang:      r.target_lang,
      charCount:       r.char_count,
      durationSecs:    r.duration_secs,
      status:          r.status,
      validationCount: r.validation_count,
      approveCount:    r.approve_count,
      rejectCount:     r.reject_count,
      coinsEarned:     r.coins_earned,
      createdAt:       r.created_at,
    }
  }
}

export const clmService = new CLMService()
