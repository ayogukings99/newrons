import { supabaseAdmin } from '../lib/supabase'
import { RhythmicFaceService } from './rhythmic-face.service'
import {
  EscrowKind, EscrowState, CREDIT_BASE, CREDIT_RELEASE_REWARD, CREDIT_DISPUTE_SLASH,
  FACE_THRESHOLD_NXT, PAIR_CYCLE_LIMIT, applyCredit, assertPhase1Kind, assertTransition,
  isRapidCycling, newEscrowKey,
} from './rhythmic-escrow.logic'

// Rhythmic escrow service — NXT-reserve mode (ESCROW_MODE=nxt-reserve).
// Value moves through the existing process_wallet_transfer RPC, the same
// reserve→execute→release pattern as SettlementBridgeService. The on-chain
// Anchor program (contracts/escrow) takes over settlement in VS3; the pda
// column already links the two.

export interface RhythmicEscrow {
  id: string
  escrowKey: string
  payerDid: string
  counterpartyDid: string
  amountNxt: number
  kind: EscrowKind
  state: EscrowState
  pda: string | null
  liveProofHash?: string | null
  expiresAt: string
}

export interface CreditView {
  did: string
  score: number
  history: Array<{ delta: number; reason: string; escrowId: string | null; at: string }>
}

const row = (r: Record<string, string | number | null>): RhythmicEscrow => ({
  id: r.id as string,
  escrowKey: r.escrow_key as string,
  payerDid: r.payer_did as string,
  counterpartyDid: r.counterparty_did as string,
  amountNxt: Number(r.amount_nxt),
  kind: r.kind as EscrowKind,
  state: r.state as EscrowState,
  pda: r.pda as string | null,
  liveProofHash: r.live_proof_hash as string | null,
  expiresAt: r.expires_at as string,
})

async function resolveDidToUserId(did: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('node_identities')
    .select('user_id')
    .eq('did', did)
    .maybeSingle()
  return (data?.user_id as number | undefined) ?? null
}

export class RhythmicEscrowService {
  async create(params: {
    payerDid: string; counterpartyDid: string; amountNxt: number; kind: string;
  }): Promise<RhythmicEscrow> {
    assertPhase1Kind(params.kind)
    if (params.amountNxt <= 0) throw new Error('Amount must be positive')
    if (params.payerDid === params.counterpartyDid) throw new Error('Self-escrow is forbidden')

    const payerId = await resolveDidToUserId(params.payerDid)
    const counterpartyId = await resolveDidToUserId(params.counterpartyDid)
    if (!payerId || !counterpartyId) {
      throw new Error('Both DIDs must be registered nodes (see identity bridge)')
    }

    // Rapid-cycling check: same pair, recent escrows → flag, still allow once.
    const { data: recent } = await supabaseAdmin
      .from('rhythmic_escrows')
      .select('created_at')
      .eq('payer_did', params.payerDid)
      .eq('counterparty_did', params.counterpartyDid)
      .order('created_at', { ascending: false })
      .limit(PAIR_CYCLE_LIMIT + 1)
    const times = (recent ?? []).map((r: { created_at: string }) => Date.parse(r.created_at))
    const farming = isRapidCycling(times)

    const { data, error } = await supabaseAdmin
      .from('rhythmic_escrows')
      .insert({
        escrow_key: newEscrowKey(),
        payer_did: params.payerDid,
        counterparty_did: params.counterpartyDid,
        amount_nxt: params.amountNxt,
        kind: params.kind,
        state: farming ? 'disputed' : 'locked',
        expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
      })
      .select()
      .single()
    if (error || !data) throw new Error(`Escrow create failed: ${error?.message}`)
    if (farming) {
      await this.mintCredit(params.payerDid, CREDIT_DISPUTE_SLASH, 'rapid_cycling_flag', data.id)
    }

    // Reserve payer NXT (escrow lock). Roll back the row on failure.
    const { error: reserveErr } = await supabaseAdmin.rpc('process_wallet_transfer', {
      p_sender_id: payerId,
      p_receiver_id: counterpartyId,
      p_amount: params.amountNxt,
      p_currency: 'NXT',
      p_type: 'rhythmic_escrow_reserve',
    })
    if (reserveErr) {
      await supabaseAdmin.from('rhythmic_escrows').delete().eq('id', data.id)
      throw new Error(`NXT reserve failed: ${reserveErr.message}`)
    }
    return row(data)
  }

  async get(id: string): Promise<RhythmicEscrow> {
    const { data, error } = await supabaseAdmin
      .from('rhythmic_escrows').select('*').eq('id', id).single()
    if (error || !data) throw new Error('Escrow not found')
    return row(data)
  }

  async accept(id: string, callerDid: string): Promise<RhythmicEscrow> {
    const esc = await this.get(id)
    if (esc.counterpartyDid !== callerDid) throw new Error('Only the counterparty can accept')
    assertTransition(esc.state, 'accepted')
    return this.setState(esc, 'accepted')
  }

  async release(id: string, callerDid: string, liveProofHash?: string): Promise<RhythmicEscrow> {
    const esc = await this.get(id)
    assertTransition(esc.state, 'released')
    if (esc.kind === 'escrow_dual' && callerDid !== esc.payerDid) {
      throw new Error('Dual-kind release needs the payer (co-signature)')
    }
    if (esc.kind === 'escrow_liveproof') {
      if (!liveProofHash || !/^[0-9a-fA-F]{64}$/.test(liveProofHash)) {
        throw new Error('Live-proof release needs the 32-byte proof hash')
      }
    }
    // Execute: reserved NXT → counterparty.
    const payerId = await resolveDidToUserId(esc.payerDid)
    const counterpartyId = await resolveDidToUserId(esc.counterpartyDid)
    if (!payerId || !counterpartyId) throw new Error('DID resolution failed at release')
    const { error: txErr } = await supabaseAdmin.rpc('process_wallet_transfer', {
      p_sender_id: payerId,
      p_receiver_id: counterpartyId,
      p_amount: esc.amountNxt,
      p_currency: 'NXT',
      p_type: 'rhythmic_escrow_execute',
    })
    if (txErr) throw new Error(`Release transfer failed: ${txErr.message}`)

    const updated = await this.setState(esc, 'released', liveProofHash)
    await this.mintCredit(esc.counterpartyDid, CREDIT_RELEASE_REWARD, 'escrow_released', esc.id)
    await this.mintCredit(esc.payerDid, 1, 'escrow_completed', esc.id)
    return updated
  }

  async reverse(id: string, callerDid: string): Promise<RhythmicEscrow> {
    const esc = await this.get(id)
    assertTransition(esc.state, 'reversed')
    const expired = Date.parse(esc.expiresAt) <= Date.now()
    const byPayerAfterExpiry = callerDid === esc.payerDid && expired
    const byCounterpartyRefusal = callerDid === esc.counterpartyDid
    if (!byPayerAfterExpiry && !byCounterpartyRefusal) {
      throw new Error('Only the payer (after expiry) or counterparty (refusal) may reverse')
    }
    const payerId = await resolveDidToUserId(esc.payerDid)
    if (!payerId) throw new Error('DID resolution failed at reverse')
    const { error: revErr } = await supabaseAdmin.rpc('process_wallet_transfer', {
      p_sender_id: payerId,
      p_receiver_id: payerId,
      p_amount: esc.amountNxt,
      p_currency: 'NXT',
      p_type: 'rhythmic_escrow_release',
    })
    if (revErr) throw new Error(`Reverse transfer failed: ${revErr.message}`)
    return this.setState(esc, 'reversed')
  }

  async tapTransfer(params: {
    senderDid: string; receiverDid: string; amountNxt: number; faceAssertionId?: string;
    idempotencyKey?: string; offlineCreatedAt?: string;
  }): Promise<{ ok: boolean; requiresFace: boolean; duplicate: boolean }> {
    const requiresFace = params.amountNxt >= FACE_THRESHOLD_NXT
    const face = new RhythmicFaceService()
    if (requiresFace) {
      // Server-issued, single-use assertion — client strings are NOT trusted.
      // Validated (not spent) up front; spent only after value moves, so a
      // failed transfer doesn't cost the user another face verification.
      // Replay is safe: idempotency keys dedupe re-settlement below.
      if (!params.faceAssertionId) throw new Error('Face assertion required at or above 50 NXT')
      face.peek(params.faceAssertionId, params.senderDid)
    }
    if (params.senderDid === params.receiverDid) throw new Error('Self-transfer is forbidden')

    // Idempotency: offline-queued retries settle exactly once.
    if (params.idempotencyKey) {
      const { data: seen } = await supabaseAdmin
        .from('rhythmic_tap_log').select('id').eq('idempotency_key', params.idempotencyKey).maybeSingle()
      if (seen) return { ok: true, requiresFace, duplicate: true }
    }

    const senderId = await resolveDidToUserId(params.senderDid)
    const receiverId = await resolveDidToUserId(params.receiverDid)
    if (!senderId || !receiverId) throw new Error('Both DIDs must be registered nodes')
    const { error } = await supabaseAdmin.rpc('process_wallet_transfer', {
      p_sender_id: senderId,
      p_receiver_id: receiverId,
      p_amount: params.amountNxt,
      p_currency: 'NXT',
      p_type: 'rhythmic_tap_transfer',
    })
    if (error) throw new Error(`Tap transfer failed: ${error.message}`)

    await supabaseAdmin.from('rhythmic_tap_log').insert({
      idempotency_key: params.idempotencyKey ?? `live_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      sender_did: params.senderDid,
      receiver_did: params.receiverDid,
      amount_nxt: params.amountNxt,
      offline_created_at: params.offlineCreatedAt ?? null,
    })
    // Value moved — now burn the assertion so it can't settle a second tap.
    if (requiresFace && params.faceAssertionId) {
      face.consume(params.faceAssertionId, params.senderDid)
    }
    await this.mintCredit(params.senderDid, 0, 'tap_transfer', null)
    return { ok: true, requiresFace, duplicate: false }
  }

  /** Ghost-safe aggregates only — no DIDs, no per-node data. */
  async mirrorStats(): Promise<{
    escrows: Record<string, number>; creditAvg: number; creditNodes: number;
    taps: number; tapVolumeNxt: number;
  }> {
    const { data: escrows } = await supabaseAdmin.from('rhythmic_escrows').select('state')
    const counts: Record<string, number> = {}
    for (const e of (escrows ?? []) as { state: string }[]) counts[e.state] = (counts[e.state] ?? 0) + 1
    const { data: scores } = await supabaseAdmin.from('civic_credit_scores').select('score')
    const nums = ((scores ?? []) as { score: number }[]).map((s) => s.score)
    const { data: taps } = await supabaseAdmin.from('rhythmic_tap_log').select('amount_nxt')
    const vols = ((taps ?? []) as { amount_nxt: string }[]).map((t) => Number(t.amount_nxt))
    return {
      escrows: counts,
      creditAvg: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : CREDIT_BASE,
      creditNodes: nums.length,
      taps: vols.length,
      tapVolumeNxt: vols.reduce((a, b) => a + b, 0),
    }
  }

  async creditView(did: string): Promise<CreditView> {
    const { data: score } = await supabaseAdmin
      .from('civic_credit_scores').select('score').eq('did', did).maybeSingle()
    const { data: events } = await supabaseAdmin
      .from('civic_credit_events')
      .select('delta,reason,escrow_id,created_at')
      .eq('did', did).order('created_at', { ascending: false }).limit(50)
    return {
      did,
      score: (score?.score as number | undefined) ?? CREDIT_BASE,
      history: (events ?? []).map((e: { delta: number; reason: string; escrow_id: string | null; created_at: string }) => ({
        delta: e.delta, reason: e.reason, escrowId: e.escrow_id, at: e.created_at,
      })),
    }
  }

  private async setState(esc: RhythmicEscrow, state: EscrowState, liveProofHash?: string): Promise<RhythmicEscrow> {
    const { data, error } = await supabaseAdmin
      .from('rhythmic_escrows')
      .update({
        state,
        live_proof_hash: liveProofHash ?? esc.liveProofHash ?? null,
        settled_at: state === 'released' || state === 'reversed' ? new Date().toISOString() : null,
      })
      .eq('id', esc.id).select().single()
    if (error || !data) throw new Error(`State update failed: ${error?.message}`)
    return row(data)
  }

  private async mintCredit(did: string, delta: number, reason: string, escrowId: string | null): Promise<void> {
    const { error: evErr } = await supabaseAdmin.from('civic_credit_events').insert({
      did, delta, reason, escrow_id: escrowId,
    })
    if (evErr) throw new Error(`Credit event failed: ${evErr.message}`)
    const { data: existing } = await supabaseAdmin
      .from('civic_credit_scores').select('score').eq('did', did).maybeSingle()
    const next = applyCredit((existing?.score as number | undefined) ?? CREDIT_BASE, delta)
    await supabaseAdmin.from('civic_credit_scores').upsert(
      { did, score: next, updated_at: new Date().toISOString() },
      { onConflict: 'did' },
    )
  }
}
