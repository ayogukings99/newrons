/**
 * WarehouseNFCService
 *
 * Extends NFC infrastructure for warehouse operations.
 * NFC tags with category='warehouse_bin' trigger warehouse events, not payments.
 *
 * Tap your phone to a bin → scan records goods receipt, task completion, or transfer.
 *
 * Architecture:
 *   - Reuses nfc_payment_tags table (category='warehouse_bin')
 *   - Records scan events in warehouse_nfc_events table
 *   - Determines action from context (current user's active task)
 *   - Supports: bin_lookup, task_complete, goods_receipt, transfer
 */

import { supabase as supabaseClient } from '../../utils/supabase'

export interface WarehouseTag {
  id: string
  ownerId: string
  label: string
  nfcUid?: string
  binId: string
  tagType: 'bin' | 'pallet' | 'asset' | 'location'
  locationId?: string
  createdAt: string
}

export interface WarehouseScanResult {
  scanType: 'bin_lookup' | 'task_complete' | 'goods_receipt' | 'transfer'
  binId?: string
  taskId?: string
  message: string
  requiresConfirmation: boolean
  pendingAction?: object
}

export interface BinInfo {
  binId: string
  label: string
  contents: Array<{ skuId: string; skuName: string; qty: number }>
  pendingTasks: Array<{ taskId: string; taskType: string; qty: number }>
}

export interface WarehouseScanEvent {
  id: string
  userId: number
  nfcUid: string
  binId?: string
  scanType: 'bin_lookup' | 'task_complete' | 'goods_receipt' | 'transfer'
  taskId?: string
  poId?: string
  skuId?: string
  qty?: number
  notes?: string
  syncStatus: 'synced' | 'pending_sync' | 'failed'
  createdAt: string
}

export class WarehouseNFCService {
  /**
   * Register a warehouse NFC tag.
   * Same NFC hardware, different category.
   * Stores in nfc_payment_tags with category='warehouse_bin'.
   */
  async registerWarehouseTag(params: {
    ownerId: string
    label: string
    nfcUid?: string
    binId: string
    tagType: 'bin' | 'pallet' | 'asset' | 'location'
    locationId?: string
  }): Promise<WarehouseTag> {
    // Generate QR fallback even for warehouse tags
    const crypto = await import('crypto')
    const shortCode = crypto.randomBytes(5).toString('hex')
    const qrFallbackUrl = `https://neurons.app/warehouse/${shortCode}`

    const { data, error } = await supabaseClient
      .from('nfc_payment_tags')
      .insert({
        owner_id: params.ownerId,
        label: params.label,
        nfc_uid: params.nfcUid ?? null,
        qr_fallback_url: qrFallbackUrl,
        category: 'warehouse_bin',
        is_active: true,
        // Store warehouse context in metadata (if available in schema, else use defaults)
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to register warehouse tag: ${error.message}`)

    return {
      id: String(data.id),
      ownerId: String(data.owner_id),
      label: data.label,
      nfcUid: data.nfc_uid ?? undefined,
      binId: params.binId,
      tagType: params.tagType,
      locationId: params.locationId,
      createdAt: data.created_at,
    }
  }

  /**
   * Process a warehouse NFC scan event.
   * Determines action from context (current user's active task).
   * Returns what action to take based on the scan.
   */
  async processWarehouseScan(params: {
    userId: number
    nfcUid: string
    actionHint?: 'task_complete' | 'goods_receipt' | 'bin_lookup' | 'transfer'
    qty?: number
    notes?: string
  }): Promise<WarehouseScanResult> {
    // 1. Resolve the tag
    const tag = await this.resolveWarehouseTagByUID(params.nfcUid)
    if (!tag) {
      throw new Error('Warehouse tag not found or inactive')
    }

    // 2. Get bin info
    const binInfo = await this.getBinInfoFromScan(params.nfcUid)

    // 3. Determine action from context
    let scanType: 'bin_lookup' | 'task_complete' | 'goods_receipt' | 'transfer' = 'bin_lookup'
    let message = `Bin ${tag.label} scanned`
    let taskId: string | undefined
    let pendingAction: object | undefined

    if (params.actionHint === 'task_complete') {
      // Check if user has active task for this bin
      const activeTask = await this.getActiveTaskForBin(params.userId, tag.binId)
      if (activeTask) {
        scanType = 'task_complete'
        taskId = activeTask.id
        message = `Ready to complete task: ${activeTask.type}`
        pendingAction = { taskId: activeTask.id, taskType: activeTask.type }
      }
    } else if (params.actionHint === 'goods_receipt') {
      scanType = 'goods_receipt'
      message = `Ready to record goods receipt for ${tag.label}`
      pendingAction = { binId: tag.binId }
    } else if (params.actionHint === 'transfer') {
      scanType = 'transfer'
      message = `Ready to transfer items from ${tag.label}`
      pendingAction = { binId: tag.binId, qty: params.qty }
    } else {
      // Default: bin lookup
      scanType = 'bin_lookup'
      message = `${binInfo.contents.length} SKUs in ${tag.label}`
    }

    // 4. Record the scan event
    await this.recordScanEvent({
      userId: params.userId,
      nfcUid: params.nfcUid,
      binId: tag.binId,
      scanType,
      taskId,
      qty: params.qty,
      notes: params.notes,
    })

    return {
      scanType,
      binId: tag.binId,
      taskId,
      message,
      requiresConfirmation: scanType !== 'bin_lookup',
      pendingAction,
    }
  }

  /**
   * Get bin info from NFC scan.
   * Returns bin ID, current contents, pending tasks.
   */
  async getBinInfoFromScan(nfcUid: string): Promise<BinInfo> {
    const tag = await this.resolveWarehouseTagByUID(nfcUid)
    if (!tag) {
      throw new Error('Tag not found')
    }

    // Fetch bin contents from warehouse inventory table
    // This assumes warehouse.bins and warehouse.bin_contents tables exist
    const { data: contents, error: contentsErr } = await supabaseClient
      .from('warehouse_bin_contents')
      .select(`
        sku_id,
        skus:warehouse_skus(id, name),
        qty
      `)
      .eq('bin_id', tag.binId)

    if (contentsErr) {
      console.warn(`Failed to fetch bin contents: ${contentsErr.message}`)
    }

    // Fetch pending tasks for this bin
    const { data: tasks, error: tasksErr } = await supabaseClient
      .from('warehouse_tasks')
      .select('id, task_type, qty_required')
      .eq('bin_id', tag.binId)
      .eq('status', 'pending')
      .limit(5)

    if (tasksErr) {
      console.warn(`Failed to fetch pending tasks: ${tasksErr.message}`)
    }

    return {
      binId: tag.binId,
      label: tag.label,
      contents: (contents ?? []).map((c: any) => ({
        skuId: c.sku_id,
        skuName: c.skus?.name ?? c.sku_id,
        qty: Number(c.qty),
      })),
      pendingTasks: (tasks ?? []).map((t: any) => ({
        taskId: String(t.id),
        taskType: t.task_type,
        qty: Number(t.qty_required),
      })),
    }
  }

  /**
   * Record a goods receipt via NFC scan.
   * Links to pending PO receipt flow.
   */
  async recordGoodsReceiptScan(params: {
    userId: number
    nfcUid: string
    poId: string
    skuId: string
    qty: number
  }): Promise<void> {
    const tag = await this.resolveWarehouseTagByUID(params.nfcUid)
    if (!tag) {
      throw new Error('Tag not found')
    }

    // Record the scan event
    await this.recordScanEvent({
      userId: params.userId,
      nfcUid: params.nfcUid,
      binId: tag.binId,
      scanType: 'goods_receipt',
      poId: params.poId,
      skuId: params.skuId,
      qty: params.qty,
    })

    // Update warehouse_bin_contents with received qty
    const { error } = await supabaseClient.rpc('upsert_bin_content', {
      p_bin_id: tag.binId,
      p_sku_id: params.skuId,
      p_qty_delta: params.qty,
    })

    if (error) {
      throw new Error(`Failed to record goods receipt: ${error.message}`)
    }
  }

  /**
   * Resolve a warehouse tag by hardware NFC UID.
   * Returns tag info if it exists and is active.
   */
  private async resolveWarehouseTagByUID(nfcUid: string): Promise<WarehouseTag | null> {
    const { data, error } = await supabaseClient
      .from('nfc_payment_tags')
      .select('id, owner_id, label, nfc_uid, is_active, created_at')
      .eq('nfc_uid', nfcUid)
      .eq('category', 'warehouse_bin')
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return null
    }

    // For now, use label as bin ID and derive tagType from label prefix
    const binId = `bin_${data.id}`
    let tagType: 'bin' | 'pallet' | 'asset' | 'location' = 'bin'
    if (data.label.startsWith('PALLET')) tagType = 'pallet'
    if (data.label.startsWith('ASSET')) tagType = 'asset'
    if (data.label.startsWith('LOC')) tagType = 'location'

    return {
      id: String(data.id),
      ownerId: String(data.owner_id),
      label: data.label,
      nfcUid: data.nfc_uid ?? undefined,
      binId,
      tagType,
      createdAt: data.created_at,
    }
  }

  /**
   * Get the active task for a user + bin combination.
   * Returns the first pending task assigned to the user for this bin.
   */
  private async getActiveTaskForBin(
    userId: number,
    binId: string
  ): Promise<{ id: string; type: string } | null> {
    const { data, error } = await supabaseClient
      .from('warehouse_tasks')
      .select('id, task_type')
      .eq('assigned_user_id', userId)
      .eq('bin_id', binId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return {
      id: String(data.id),
      type: data.task_type,
    }
  }

  /**
   * Record a scan event in warehouse_nfc_events table.
   */
  private async recordScanEvent(params: {
    userId: number
    nfcUid: string
    binId: string
    scanType: 'bin_lookup' | 'task_complete' | 'goods_receipt' | 'transfer'
    taskId?: string
    poId?: string
    skuId?: string
    qty?: number
    notes?: string
  }): Promise<void> {
    const { error } = await supabaseClient
      .from('warehouse_nfc_events')
      .insert({
        user_id: params.userId,
        nfc_uid: params.nfcUid,
        bin_id: params.binId,
        scan_type: params.scanType,
        task_id: params.taskId ?? null,
        po_id: params.poId ?? null,
        sku_id: params.skuId ?? null,
        qty: params.qty ?? null,
        notes: params.notes ?? null,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      })

    if (error) {
      console.error(`Failed to record scan event: ${error.message}`)
      // Don't throw — scan already happened, event recording is best-effort
    }
  }
}
