/**
 * Community Treasury & Grants Service — Phase 5
 *
 * The NEXUS Community Treasury is a DAO-governed fund that:
 *   - Accumulates a percentage of platform revenue (NXT fees, marketplace royalties)
 *   - Distributes funds via community-voted grants
 *   - Funds language model training initiatives, community builders, and ecosystem tools
 *
 * This service extends the existing DAO service with grant-specific capabilities:
 *
 * 1. GRANT APPLICATIONS
 *    - Any user can apply for a community grant
 *    - Application: title, description, requested_nxt, milestones[], impact_statement
 *    - Requires ≥ 500 NXT held to apply (prevents spam)
 *    - Each grant application becomes a DAO proposal of type 'grant'
 *
 * 2. GRANT VOTING
 *    - Uses the existing DAO voting system (NXT-weighted)
 *    - Grant proposals use a 14-day voting window (double the standard 7 days)
 *    - Approval threshold: simple majority (51%)
 *    - Quorum: 3% of eligible voters (lower than standard to encourage participation)
 *
 * 3. GRANT DISBURSEMENT
 *    - Approved grants are disbursed milestone-by-milestone
 *    - Recipient submits milestone proof; community validators review
 *    - On approval: platform transfers NXT from treasury to recipient wallet
 *    - If milestones are missed: remaining funds returned to treasury
 *
 * 4. TREASURY MANAGEMENT
 *    - Treasury balance tracked in DB + on-chain (same dao_treasury table from Phase 4)
 *    - Inflow sources: 2% of marketplace trades, 1% of NFC transfer fees, platform surplus
 *    - Outflow: grant disbursements, CLM training bounties
 *    - Treasury reports: monthly statement, per-grant allocation
 *
 * DB tables:
 *   grant_applications    — submitted grant proposals
 *   grant_milestones      — milestone definitions per grant
 *   grant_disbursements   — individual milestone payment records
 *   treasury_transactions — all treasury in/out flows
 */

import { supabaseAdmin } from '../lib/supabase'
import { solanaService }  from './solana.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type GrantStatus =
  | 'draft' | 'submitted' | 'voting' | 'approved'
  | 'active' | 'completed' | 'rejected' | 'cancelled'

export type MilestoneStatus = 'pending' | 'submitted' | 'approved' | 'rejected'

export interface GrantMilestone {
  order:         number
  title:         string
  description:   string
  nxtAmount:     number
  dueDate?:      string
}

export interface GrantApplication {
  id:               string
  applicantId:      string
  title:            string
  description:      string
  impactStatement:  string
  requestedNxt:     number
  milestones:       GrantMilestone[]
  status:           GrantStatus
  daoProposalId?:   string
  approvedAt?:      string
  disbursedNxt:     number
  createdAt:        string
}

export interface TreasuryReport {
  balanceNxt:        number
  totalInflow:       number
  totalOutflow:      number
  activeGrants:      number
  completedGrants:   number
  pendingDisbursement: number
  lastUpdatedAt:     string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_NXT_TO_APPLY     = 500   // min NXT balance to submit a grant
const GRANT_VOTING_DAYS    = 14    // grant proposals stay open 14 days
const TREASURY_FEE_TRADE   = 0.02  // 2% of marketplace trades
const TREASURY_FEE_NFC     = 0.01  // 1% of NFC transfer fees

// ── Service ───────────────────────────────────────────────────────────────────

export class GrantsService {

  // ── Grant Applications ─────────────────────────────────────────────────────

  /**
   * Submit a new grant application. Creates a linked DAO proposal automatically.
   */
  async submitApplication(params: {
    applicantId:     string
    title:           string
    description:     string
    impactStatement: string
    requestedNxt:    number
    milestones:      GrantMilestone[]
  }): Promise<{ applicationId: string; daoProposalId: string }> {
    const { applicantId, title, description, impactStatement, requestedNxt, milestones } = params

    if (requestedNxt <= 0)    throw new Error('requestedNxt must be positive')
    if (!milestones.length)   throw new Error('At least one milestone required')
    if (milestones.reduce((s, m) => s + m.nxtAmount, 0) !== requestedNxt) {
      throw new Error('Milestone NXT amounts must sum to requestedNxt')
    }

    // Check applicant has minimum NXT balance
    const { data: balance } = await supabaseAdmin
      .from('user_coin_balances')
      .select('balance')
      .eq('user_id', applicantId)
      .maybeSingle()

    const currentBalance = balance?.balance ?? 0
    if (currentBalance < MIN_NXT_TO_APPLY) {
      throw new Error(`You need at least ${MIN_NXT_TO_APPLY} NXT to submit a grant application (you have ${currentBalance})`)
    }

    // Check treasury has enough funds
    const treasury = await this.getTreasuryBalance()
    if (requestedNxt > treasury.balanceNxt) {
      throw new Error(`Requested amount (${requestedNxt} NXT) exceeds treasury balance (${treasury.balanceNxt} NXT)`)
    }

    // Create the grant application record
    const { data: grant, error } = await supabaseAdmin
      .from('grant_applications')
      .insert({
        applicant_id:     applicantId,
        title,
        description,
        impact_statement: impactStatement,
        requested_nxt:    requestedNxt,
        milestones:       JSON.stringify(milestones),
        status:           'submitted',
        disbursed_nxt:    0,
      })
      .select('id')
      .single()

    if (error || !grant) throw new Error(`Failed to create application: ${error?.message}`)

    // Create a DAO proposal linked to this grant
    const { data: proposal, error: pErr } = await supabaseAdmin
      .from('dao_proposals')
      .insert({
        proposer_id:    applicantId,
        type:           'grant',
        title:          `Community Grant: ${title}`,
        description:    `${description}\n\nImpact: ${impactStatement}\n\nRequested: ${requestedNxt} NXT\n\nMilestones: ${milestones.length}`,
        metadata:       JSON.stringify({ grantApplicationId: grant.id, requestedNxt, milestones }),
        status:         'voting',
        voting_ends_at: new Date(Date.now() + GRANT_VOTING_DAYS * 86_400_000).toISOString(),
        for_votes:      0,
        against_votes:  0,
        abstain_votes:  0,
      })
      .select('id')
      .single()

    if (pErr || !proposal) throw new Error(`Failed to create DAO proposal: ${pErr?.message}`)

    // Link proposal back to grant
    await supabaseAdmin
      .from('grant_applications')
      .update({ dao_proposal_id: proposal.id, status: 'voting' })
      .eq('id', grant.id)

    return { applicationId: grant.id, daoProposalId: proposal.id }
  }

  /**
   * List grant applications with optional status filter.
   */
  async listApplications(params: {
    status?: GrantStatus
    limit?:  number
    offset?: number
  }): Promise<GrantApplication[]> {
    const { status, limit = 20, offset = 0 } = params

    let q = supabaseAdmin
      .from('grant_applications')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []).map(this.mapGrant)
  }

  async getApplication(id: string): Promise<GrantApplication | null> {
    const { data } = await supabaseAdmin
      .from('grant_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    return data ? this.mapGrant(data) : null
  }

  // ── Finalization ───────────────────────────────────────────────────────────

  /**
   * Finalize a grant after its DAO voting window closes.
   * Called by the DAO service when a grant proposal is finalized.
   */
  async finalizeGrant(daoProposalId: string, approved: boolean): Promise<void> {
    const { data: grant } = await supabaseAdmin
      .from('grant_applications')
      .select('id')
      .eq('dao_proposal_id', daoProposalId)
      .maybeSingle()

    if (!grant) return

    await supabaseAdmin
      .from('grant_applications')
      .update({
        status:      approved ? 'approved' : 'rejected',
        approved_at: approved ? new Date().toISOString() : null,
      })
      .eq('id', grant.id)
  }

  // ── Milestone Disbursement ────────────────────────────────────────────────

  /**
   * Submit proof of milestone completion. Opens a 72-hour validator review window.
   */
  async submitMilestoneProof(params: {
    grantId:        string
    applicantId:    string
    milestoneOrder: number
    proofUrl:       string
    notes?:         string
  }): Promise<{ disbursementId: string }> {
    const { grantId, applicantId, milestoneOrder, proofUrl, notes } = params

    const { data: grant } = await supabaseAdmin
      .from('grant_applications')
      .select('*')
      .eq('id', grantId)
      .eq('applicant_id', applicantId)
      .eq('status', 'approved')
      .single()

    if (!grant) throw new Error('Grant not found or not approved')

    const milestones: GrantMilestone[] = JSON.parse(grant.milestones ?? '[]')
    const milestone = milestones.find(m => m.order === milestoneOrder)
    if (!milestone) throw new Error(`Milestone ${milestoneOrder} not found`)

    // Check milestone not already disbursed
    const { data: existing } = await supabaseAdmin
      .from('grant_disbursements')
      .select('id')
      .eq('grant_id', grantId)
      .eq('milestone_order', milestoneOrder)
      .in('status', ['approved', 'submitted'])
      .maybeSingle()

    if (existing) throw new Error('This milestone has already been submitted or approved')

    const { data: disbursement, error } = await supabaseAdmin
      .from('grant_disbursements')
      .insert({
        grant_id:        grantId,
        milestone_order: milestoneOrder,
        nxt_amount:      milestone.nxtAmount,
        proof_url:       proofUrl,
        notes:           notes ?? null,
        status:          'submitted',
        review_ends_at:  new Date(Date.now() + 72 * 3_600_000).toISOString(),
      })
      .select('id')
      .single()

    if (error || !disbursement) throw new Error(`Failed to submit milestone: ${error?.message}`)

    // Mark grant as active if first milestone
    await supabaseAdmin
      .from('grant_applications')
      .update({ status: 'active' })
      .eq('id', grantId)
      .eq('status', 'approved')

    return { disbursementId: disbursement.id }
  }

  /**
   * Approve a milestone disbursement. Transfers NXT from treasury to recipient.
   * Called by admin/DAO executor after community validator review.
   */
  async approveMilestoneDisbursement(disbursementId: string, approverId: string): Promise<{ txSignature?: string }> {
    const { data: disbursement } = await supabaseAdmin
      .from('grant_disbursements')
      .select('*, grant_applications(applicant_id, title)')
      .eq('id', disbursementId)
      .eq('status', 'submitted')
      .single()

    if (!disbursement) throw new Error('Disbursement not found or not in submitted state')

    const recipientId = (disbursement.grant_applications as any)?.applicant_id
    const nxtAmount   = disbursement.nxt_amount

    // Transfer from treasury to recipient on-chain
    let txSignature: string | undefined
    try {
      txSignature = await solanaService.transferFromTreasury(recipientId, nxtAmount)
    } catch (e: any) {
      throw new Error(`Treasury transfer failed: ${e.message}`)
    }

    // Update disbursement record
    await supabaseAdmin
      .from('grant_disbursements')
      .update({
        status:       'approved',
        approved_by:  approverId,
        approved_at:  new Date().toISOString(),
        tx_signature: txSignature ?? null,
      })
      .eq('id', disbursementId)

    // Update grant disbursed total
    await supabaseAdmin.rpc('grant_increment_disbursed', {
      p_grant_id: disbursement.grant_id,
      p_amount:   nxtAmount,
    })

    // Record treasury outflow
    await this.recordTreasuryTransaction('outflow', nxtAmount, `Grant milestone disbursement: ${disbursementId}`)

    // Check if all milestones complete
    await this.checkGrantCompletion(disbursement.grant_id)

    return { txSignature }
  }

  // ── Treasury ───────────────────────────────────────────────────────────────

  async getTreasuryBalance(): Promise<TreasuryReport> {
    const { data: treasury } = await supabaseAdmin
      .from('dao_treasury')
      .select('*')
      .eq('id', 1)
      .single()

    const { data: activeGrants } = await supabaseAdmin
      .from('grant_applications')
      .select('requested_nxt, disbursed_nxt')
      .in('status', ['approved', 'active'])

    const activeCount          = activeGrants?.length ?? 0
    const pendingDisbursement  = (activeGrants ?? []).reduce(
      (s, g) => s + (g.requested_nxt - g.disbursed_nxt), 0
    )

    const { count: completedCount } = await supabaseAdmin
      .from('grant_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')

    return {
      balanceNxt:          treasury?.nxt_balance        ?? 0,
      totalInflow:         treasury?.total_inflow        ?? 0,
      totalOutflow:        treasury?.total_outflow       ?? 0,
      activeGrants:        activeCount,
      completedGrants:     completedCount ?? 0,
      pendingDisbursement,
      lastUpdatedAt:       treasury?.updated_at          ?? new Date().toISOString(),
    }
  }

  /**
   * Record a treasury inflow (called by marketplace/NFC fee collection).
   */
  async recordTreasuryInflow(amountNxt: number, source: string): Promise<void> {
    await this.recordTreasuryTransaction('inflow', amountNxt, source)
  }

  private async recordTreasuryTransaction(
    direction: 'inflow' | 'outflow',
    amountNxt: number,
    note: string,
  ): Promise<void> {
    await supabaseAdmin
      .from('treasury_transactions')
      .insert({ direction, amount_nxt: amountNxt, note })

    const field = direction === 'inflow' ? 'nxt_balance' : 'nxt_balance'
    const delta = direction === 'inflow' ? amountNxt : -amountNxt

    await supabaseAdmin.rpc('treasury_adjust_balance', {
      p_delta:     delta,
      p_direction: direction,
      p_amount:    amountNxt,
    })
  }

  private async checkGrantCompletion(grantId: string): Promise<void> {
    const { data: grant } = await supabaseAdmin
      .from('grant_applications')
      .select('requested_nxt, disbursed_nxt')
      .eq('id', grantId)
      .single()

    if (grant && grant.disbursed_nxt >= grant.requested_nxt) {
      await supabaseAdmin
        .from('grant_applications')
        .update({ status: 'completed' })
        .eq('id', grantId)
    }
  }

  private mapGrant(r: any): GrantApplication {
    return {
      id:               r.id,
      applicantId:      r.applicant_id,
      title:            r.title,
      description:      r.description,
      impactStatement:  r.impact_statement,
      requestedNxt:     r.requested_nxt,
      milestones:       JSON.parse(r.milestones ?? '[]'),
      status:           r.status,
      daoProposalId:    r.dao_proposal_id,
      approvedAt:       r.approved_at,
      disbursedNxt:     r.disbursed_nxt,
      createdAt:        r.created_at,
    }
  }
}

export const grantsService = new GrantsService()
