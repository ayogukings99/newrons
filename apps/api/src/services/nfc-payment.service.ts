import { supabase } from '../utils/supabase'
import { config } from '../utils/config'
import crypto from 'crypto'

export interface NFCPaymentTag {
  id: string
  ownerId: string
  label: string
  nfcUid?: string
  qrFallbackUrl: string
  defaultAmount?: number
  currency: string
  category: string
  geoPoint?: { lat: number; lng: number }
  isActive: boolean
  totalReceived: number
  tapCount: number
  createdAt: string
}

export interface TapTransaction {
  id: string
  senderId: string
  receiverId: string
  nfcTagId?: string
  amount: number
  currency: string
  syncStatus: 'synced' | 'pending_sync' | 'failed'
  offlineCreatedAt?: string
  syncedAt?: string
  createdAt: string
}

export interface OfflineTap {
  senderId: string
  nfcUid: string
  amount: number
  currency?: string
  offlineCreatedAt: string
  idempotencyKey: string  // client-generated UUID to prevent double-processing
}

export class NFCPaymentService {
  /**
   * Create an NFC payment tag for a permanent location.
   * Generates a QR fallback URL for non-NFC devices.
   */
  async createTag(params: {
    ownerId: string
    label: string
    defaultAmount?: number
    category: string
    geoPoint?: { lat: number; lng: number }
    currency?: string
  }): Promise<NFCPaymentTag> {
    // Generate a unique short-code for the QR fallback
    const shortCode = crypto.randomBytes(5).toString('hex')
    const qrFallbackUrl = `https://nexus.app/pay/${shortCode}`

    const geoValue = params.geoPoint
      ? `POINT(${params.geoPoint.lng} ${params.geoPoint.lat})`
      : null

    const { data, error } = await supabase
      .from('nfc_payment_tags')
      .insert({
        owner_id: params.ownerId,
        label: params.label,
        qr_fallback_url: qrFallbackUrl,
        default_amount: params.defaultAmount ?? null,
        currency: params.currency ?? 'NGN',
        category: params.category,
        geo_point: geoValue,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create NFC tag: ${error.message}`)
    return this.mapTag(data)
  }

  /**
   * Get all NFC tags owned by a user.
   */
  async listUserTags(ownerId: string): Promise<NFCPaymentTag[]> {
    const { data, error } = await supabase
      .from('nfc_payment_tags')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw new Error(`Failed to list NFC tags: ${error.message}`)
    return (data ?? []).map(this.mapTag)
  }

  /**
   * Resolve an NFC tag by hardware UID — called the moment a phone reads the tag.
   * Returns payment info to pre-fill the payment screen.
   */
  async resolveTagByUID(nfcUid: string): Promise<NFCPaymentTag> {
    const { data, error } = await supabase
      .from('nfc_payment_tags')
      .select(`
        *,
        owner:users!owner_id (id, username, display_name, avatar_url)
      `)
      .eq('nfc_uid', nfcUid)
      .eq('is_active', true)
      .single()

    if (error || !data) throw new Error('NFC tag not found or inactive')
    return this.mapTag(data)
  }

  /**
   * Resolve a tag by QR short-code (fallback for non-NFC phones).
   */
  async resolveTagByQR(shortCode: string): Promise<NFCPaymentTag> {
    const { data, error } = await supabase
      .from('nfc_payment_tags')
      .select('*')
      .like('qr_fallback_url', `%/${shortCode}`)
      .eq('is_active', true)
      .single()

    if (error || !data) throw new Error('QR code not found or expired')
    return this.mapTag(data)
  }

  /**
   * Process a tap payment from sender to receiver.
   * Validates balance, creates transaction, updates tag stats.
   * Thread-safe via Postgres transaction.
   */
  async processTap(params: {
    senderId: string
    nfcUid?: string
    tagId?: string
    receiverId: string
    amount: number
    currency?: string
  }): Promise<TapTransaction> {
    const currency = params.currency ?? 'NGN'

    // 1. Validate sender has sufficient balance
    const { data: sender, error: senderErr } = await supabase
      .from('users')
      .select('id, wallet_balance, currency')
      .eq('id', params.senderId)
      .single()

    if (senderErr || !sender) throw new Error('Sender not found')
    if (sender.wallet_balance < params.amount) {
      throw new Error('Insufficient wallet balance')
    }

    // 2. Debit sender, credit receiver (atomic via RPC)
    const { data: tx, error: txErr } = await supabase.rpc('process_wallet_transfer', {
      p_sender_id: params.senderId,
      p_receiver_id: params.receiverId,
      p_amount: params.amount,
      p_currency: currency,
      p_type: 'nfc_tap',
    })

    if (txErr) throw new Error(`Transfer failed: ${txErr.message}`)

    // 3. Record the tap transaction
    const { data: tap, error: tapErr } = await supabase
      .from('tap_transactions')
      .insert({
        sender_id: params.senderId,
        receiver_id: params.receiverId,
        nfc_tag_id: params.tagId ?? null,
        amount: params.amount,
        currency,
        transaction_id: tx.transaction_id,
        sync_status: 'synced',
        synced_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (tapErr) throw new Error(`Failed to record tap: ${tapErr.message}`)

    // 4. Update tag stats (tap_count, total_received)
    if (params.tagId) {
      await supabase.rpc('increment_tag_stats', {
        p_tag_id: params.tagId,
        p_amount: params.amount,
      })
    }

    return this.mapTapTransaction(tap)
  }

  /**
   * Sync queued offline taps when connectivity returns.
   * Processes in chronological order. Idempotent — skips duplicates.
   */
  async syncOfflineQueue(taps: OfflineTap[]): Promise<{
    synced: TapTransaction[]
    failed: Array<{ tap: OfflineTap; reason: string }>
  }> {
    // Sort by offline_created_at (oldest first)
    const sorted = [...taps].sort(
      (a, b) => new Date(a.offlineCreatedAt).getTime() - new Date(b.offlineCreatedAt).getTime()
    )

    const synced: TapTransaction[] = []
    const failed: Array<{ tap: OfflineTap; reason: string }> = []

    for (const tap of sorted) {
      try {
        // Check for duplicate (idempotency)
        const { data: existing } = await supabase
          .from('tap_transactions')
          .select('id')
          .eq('idempotency_key', tap.idempotencyKey)
          .maybeSingle()

        if (existing) {
          // Already processed — skip silently
          continue
        }

        // Resolve tag to get receiver
        const tag = await this.resolveTagByUID(tap.nfcUid)
        const result = await this.processTap({
          senderId: tap.senderId,
          nfcUid: tap.nfcUid,
          tagId: tag.id,
          receiverId: tag.ownerId,
          amount: tap.amount,
          currency: tap.currency,
        })
        synced.push(result)
      } catch (err: any) {
        failed.push({ tap, reason: err.message })
      }
    }

    return { synced, failed }
  }

  /**
   * Deactivate an NFC tag (soft delete).
   */
  async deactivateTag(tagId: string, ownerId: string): Promise<void> {
    const { error } = await supabase
      .from('nfc_payment_tags')
      .update({ is_active: false })
      .eq('id', tagId)
      .eq('owner_id', ownerId)  // ensure ownership

    if (error) throw new Error(`Failed to deactivate tag: ${error.message}`)
  }

  private mapTag(row: any): NFCPaymentTag {
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      label: row.label,
      nfcUid: row.nfc_uid ?? undefined,
      qrFallbackUrl: row.qr_fallback_url,
      defaultAmount: row.default_amount ? Number(row.default_amount) : undefined,
      currency: row.currency,
      category: row.category,
      isActive: row.is_active,
      totalReceived: Number(row.total_received),
      tapCount: row.tap_count,
      createdAt: row.created_at,
    }
  }

  private mapTapTransaction(row: any): TapTransaction {
    return {
      id: String(row.id),
      senderId: String(row.sender_id),
      receiverId: String(row.receiver_id),
      nfcTagId: row.nfc_tag_id ? String(row.nfc_tag_id) : undefined,
      amount: Number(row.amount),
      currency: row.currency,
      syncStatus: row.sync_status,
      offlineCreatedAt: row.offline_created_at ?? undefined,
      syncedAt: row.synced_at ?? undefined,
      createdAt: row.created_at,
    }
  }
}
