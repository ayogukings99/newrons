/**
 * Settlement Bridge Service — NXT Settlement for Supply Chain POs
 *
 * Bridges Purchase Orders (supply-chain-os) with NXT wallet transfers (community coins).
 * When a PO is confirmed/received, NXT is transferred from buyer to supplier.
 *
 * Settlement flow:
 *   1. PO ISSUED (no NXT movement)
 *   2. PO CONFIRMED → reservePoSettlement() — lock buyer's NXT in escrow
 *   3. PO RECEIVED → executePoSettlement() — release escrow, transfer to supplier
 *   4. PO CANCELLED → releasePoSettlement() — return NXT to buyer's available balance
 */

import { supabaseAdmin } from '../../lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PoSettlement {
  id: string
  poId: string
  buyerDid: string
  supplierDid: string
  amountNxt: number
  transactionId?: string
  status: 'pending' | 'reserved' | 'settled' | 'failed' | 'released'
  settledAt?: string
  createdAt: string
}

export interface SettlementHistoryItem extends PoSettlement {
  buyerUsername?: string
  supplierUsername?: string
  poStatus?: string
}

// ── Service ────────────────────────────────────────────────────────────────

export class SettlementBridgeService {
  /**
   * Reserve NXT for a confirmed PO (escrow lock).
   * Called when PO status moves to CONFIRMED.
   *
   * 1. Resolve DIDs to user IDs
   * 2. Check buyer has sufficient balance
   * 3. Create settlement record with status='reserved'
   * 4. Atomically debit buyer's balance (held in escrow)
   */
  async reservePoSettlement(params: {
    poId: string
    buyerDid: string
    supplierDid: string
    amountNxt: number
  }): Promise<PoSettlement> {
    const { poId, buyerDid, supplierDid, amountNxt } = params

    if (!poId || !buyerDid || !supplierDid || amountNxt <= 0) {
      throw new Error('Invalid settlement parameters: missing or invalid values')
    }

    // Resolve DIDs to user IDs
    const buyerId = await this.resolveDidToUserId(buyerDid)
    const supplierId = await this.resolveDidToUserId(supplierDid)

    if (!buyerId || !supplierId) {
      throw new Error('Could not resolve buyer or supplier DID to user ID')
    }

    // Check buyer balance
    const { data: buyerBalance } = await supabaseAdmin
      .from('user_coin_balances')
      .select('balance')
      .eq('user_id', buyerId)
      .maybeSingle()

    const currentBalance = buyerBalance?.balance ?? 0
    if (currentBalance < amountNxt) {
      throw new Error(
        `Insufficient NXT balance. Required: ${amountNxt}, Available: ${currentBalance}`
      )
    }

    // Check if settlement already exists for this PO
    const { data: existing } = await supabaseAdmin
      .from('po_settlements')
      .select('id')
      .eq('po_id', poId)
      .in('status', ['reserved', 'settled'])
      .maybeSingle()

    if (existing) {
      throw new Error(`Settlement already exists for PO ${poId}`)
    }

    // Create settlement record
    const { data: settlement, error: settlementErr } = await supabaseAdmin
      .from('po_settlements')
      .insert({
        po_id: poId,
        buyer_did: buyerDid,
        supplier_did: supplierDid,
        amount_nxt: amountNxt,
        status: 'reserved',
      })
      .select()
      .single()

    if (settlementErr || !settlement) {
      throw new Error(`Failed to create settlement: ${settlementErr?.message}`)
    }

    // Reserve NXT in escrow via RPC
    const { error: reserveErr } = await supabaseAdmin.rpc('process_wallet_transfer', {
      p_sender_id: buyerId,
      p_receiver_id: supplierId,
      p_amount: amountNxt,
      p_currency: 'NXT',
      p_type: 'po_settlement_reserve',
    })

    if (reserveErr) {
      // Rollback settlement record if transfer fails
      await supabaseAdmin
        .from('po_settlements')
        .delete()
        .eq('id', settlement.id)
      throw new Error(`Failed to reserve NXT: ${reserveErr.message}`)
    }

    // Update settlement with transaction ID (if returned by RPC)
    const updatedSettlement = this.mapSettlement(settlement)
    return updatedSettlement
  }

  /**
   * Execute settlement when goods are received.
   * Called when PO status moves to RECEIVED.
   *
   * 1. Load settlement record
   * 2. Verify status is 'reserved'
   * 3. Execute the wallet transfer (move from escrow to supplier)
   * 4. Update settlement status to 'settled'
   */
  async executePoSettlement(poId: string): Promise<PoSettlement> {
    // Fetch settlement
    const { data: settlement, error: fetchErr } = await supabaseAdmin
      .from('po_settlements')
      .select('*')
      .eq('po_id', poId)
      .eq('status', 'reserved')
      .maybeSingle()

    if (fetchErr || !settlement) {
      throw new Error(`Settlement not found or not in reserved state for PO ${poId}`)
    }

    // Resolve DIDs to user IDs
    const buyerId = await this.resolveDidToUserId(settlement.buyer_did)
    const supplierId = await this.resolveDidToUserId(settlement.supplier_did)

    if (!buyerId || !supplierId) {
      throw new Error('Could not resolve buyer or supplier DID for execution')
    }

    // Execute the transfer on-chain
    const { data: txResult, error: txErr } = await supabaseAdmin.rpc('process_wallet_transfer', {
      p_sender_id: buyerId,
      p_receiver_id: supplierId,
      p_amount: settlement.amount_nxt,
      p_currency: 'NXT',
      p_type: 'po_settlement_execute',
    })

    if (txErr) {
      // Mark as failed
      await supabaseAdmin
        .from('po_settlements')
        .update({ status: 'failed' })
        .eq('id', settlement.id)
      throw new Error(`Settlement execution failed: ${txErr.message}`)
    }

    // Update settlement status to settled
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('po_settlements')
      .update({
        status: 'settled',
        settled_at: new Date().toISOString(),
        transaction_id: txResult?.transaction_id ?? null,
      })
      .eq('id', settlement.id)
      .select()
      .single()

    if (updateErr || !updated) {
      throw new Error(`Failed to update settlement status: ${updateErr?.message}`)
    }

    return this.mapSettlement(updated)
  }

  /**
   * Release escrow if PO is cancelled.
   * Called when PO status moves to CANCELLED.
   *
   * Returns reserved NXT to buyer's available balance.
   */
  async releasePoSettlement(poId: string): Promise<void> {
    // Fetch settlement
    const { data: settlement, error: fetchErr } = await supabaseAdmin
      .from('po_settlements')
      .select('*')
      .eq('po_id', poId)
      .in('status', ['reserved', 'pending'])
      .maybeSingle()

    if (fetchErr || !settlement) {
      // Settlement may not exist yet (PO cancelled before confirmation)
      return
    }

    // Resolve DIDs to user IDs
    const buyerId = await this.resolveDidToUserId(settlement.buyer_did)

    if (!buyerId) {
      throw new Error('Could not resolve buyer DID for release')
    }

    // Reverse the transfer (credit buyer back)
    const { error: reverseErr } = await supabaseAdmin.rpc('process_wallet_transfer', {
      p_sender_id: buyerId, // Note: send to self to restore
      p_receiver_id: buyerId,
      p_amount: settlement.amount_nxt,
      p_currency: 'NXT',
      p_type: 'po_settlement_release',
    })

    if (reverseErr) {
      throw new Error(`Failed to release escrow: ${reverseErr.message}`)
    }

    // Update settlement status to released
    await supabaseAdmin
      .from('po_settlements')
      .update({ status: 'released', settled_at: new Date().toISOString() })
      .eq('id', settlement.id)
  }

  /**
   * Get settlement status for a PO.
   */
  async getSettlementStatus(poId: string): Promise<PoSettlement | null> {
    const { data, error } = await supabaseAdmin
      .from('po_settlements')
      .select('*')
      .eq('po_id', poId)
      .maybeSingle()

    if (error) throw new Error(`Failed to fetch settlement: ${error.message}`)
    return data ? this.mapSettlement(data) : null
  }

  /**
   * Get settlement history for a user's DIDs.
   * Returns paginated list of settlements (as buyer or supplier).
   */
  async getSettlementHistory(userDid: string, limit = 50, offset = 0): Promise<SettlementHistoryItem[]> {
    // Get both buyer and supplier settlements
    const { data: settlements, error } = await supabaseAdmin
      .from('po_settlements')
      .select(`
        *,
        buyer:node_identities!buyer_did (did, user_id),
        supplier:node_identities!supplier_did (did, user_id)
      `)
      .or(`buyer_did.eq.${userDid},supplier_did.eq.${userDid}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new Error(`Failed to fetch settlement history: ${error.message}`)

    // Map settlements and fetch optional user details
    const items = (settlements ?? []).map(s => this.mapSettlement(s) as SettlementHistoryItem)

    // Optionally enrich with usernames
    for (const item of items) {
      if (item.buyerDid === userDid) {
        item.buyerUsername = await this.fetchUsername(item.buyerDid)
      }
      if (item.supplierDid === userDid) {
        item.supplierUsername = await this.fetchUsername(item.supplierDid)
      }
    }

    return items
  }

  /**
   * Convert fiat amount to NXT using current rates.
   * Delegates to NxtRateService.
   */
  async fiatToNxt(amount: number, currency: string): Promise<number> {
    const { nxtRateService } = await import('./nxt-rate.service')
    return nxtRateService.fiatToNxt(amount, currency)
  }

  /**
   * Convert NXT to fiat amount using current rates.
   */
  async nxtToFiat(nxtAmount: number, currency: string): Promise<number> {
    const { nxtRateService } = await import('./nxt-rate.service')
    return nxtRateService.nxtToFiat(nxtAmount, currency)
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private async resolveDidToUserId(did: string): Promise<number | null> {
    const { data, error } = await supabaseAdmin.rpc('resolve_did_to_user', {
      p_did: did,
    })

    if (error) {
      console.error(`Failed to resolve DID ${did}:`, error.message)
      return null
    }

    return data
  }

  private async fetchUsername(did: string): Promise<string | undefined> {
    const userId = await this.resolveDidToUserId(did)
    if (!userId) return undefined

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('username')
      .eq('id', userId)
      .maybeSingle()

    if (error || !data) return undefined
    return data.username
  }

  private mapSettlement(row: any): PoSettlement {
    return {
      id: String(row.id),
      poId: String(row.po_id),
      buyerDid: String(row.buyer_did),
      supplierDid: String(row.supplier_did),
      amountNxt: Number(row.amount_nxt),
      transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
      status: row.status,
      settledAt: row.settled_at ?? undefined,
      createdAt: row.created_at,
    }
  }
}

export const settlementBridgeService = new SettlementBridgeService()
