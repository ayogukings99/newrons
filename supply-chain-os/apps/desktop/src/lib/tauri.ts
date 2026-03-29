/// Typed wrappers around all Tauri IPC commands.
///
/// Each function maps 1:1 to a `#[tauri::command]` in src-tauri/src/commands/.
/// Using this module instead of raw `invoke()` gives us TypeScript type-checking
/// on both the input and return types.

import { invoke } from '@tauri-apps/api/core'
import type {
  IdentityResult,
  NodeProfile,
  Sku,
  StockLevel,
  PurchaseOrder,
  CreatePoInput,
  WarehouseTask,
  Peer,
  ChainEvent,
  ChainHead,
} from '@scos/shared-types'

// ─── Identity ────────────────────────────────────────────────────────────────

export const getOrCreateIdentity = (): Promise<IdentityResult> =>
  invoke('get_or_create_identity')

export const getNodeProfile = (): Promise<NodeProfile> =>
  invoke('get_node_profile')

// ─── Inventory ───────────────────────────────────────────────────────────────

export const listSkus = (): Promise<{ skus: Sku[] }> =>
  invoke('list_skus')

export const createSku = (input: Omit<Sku, 'created_at'>): Promise<{ status: string; event_id: string; timestamp: number }> =>
  invoke('create_sku', { input })

export const getStockLevels = (skuId: string): Promise<{ levels: StockLevel[] }> =>
  invoke('get_stock_levels', { sku_id: skuId })

export const getStockHistory = (skuId: string, limit?: number): Promise<{ history: StockEvent[] }> =>
  invoke('get_stock_history', { sku_id: skuId, limit })

export const adjustStock = (args: {
  skuId: string
  locationId: string
  delta: number
  reason: string
}): Promise<{ status: string; event_id: string; timestamp: number }> =>
  invoke('adjust_stock', {
    input: {
      sku_id: args.skuId,
      location_id: args.locationId,
      delta: args.delta,
      reason: args.reason,
    }
  })

export const receiveStock = (args: {
  skuId: string
  locationId: string
  qty: number
}): Promise<{ status: string; event_id: string; timestamp: number }> =>
  invoke('receive_stock', {
    input: {
      sku_id: args.skuId,
      location_id: args.locationId,
      qty: args.qty,
    }
  })

export const transferStock = (args: {
  skuId: string
  fromLocation: string
  toLocation: string
  qty: number
}): Promise<{ status: string; event_id: string; timestamp: number }> =>
  invoke('transfer_stock', {
    input: {
      sku_id: args.skuId,
      from_location: args.fromLocation,
      to_location: args.toLocation,
      qty: args.qty,
    }
  })

export interface ReorderAlert {
  sku_id: string
  sku_name: string
  location_id: string
  qty_on_hand: number
  reorder_point: number
  qty_to_order: number
}

export const checkReorderAlerts = (): Promise<{ alerts: ReorderAlert[] }> =>
  invoke('check_reorder_alerts')

export interface CountResult {
  sku_id: string
  location_id: string
  expected_qty: number
  counted_qty: number
  delta: number
  variance_pct: number
}

export const batchStockCount = (counts: Array<{ sku_id: string; location_id: string; counted_qty: number }>): Promise<{ status: string; results: CountResult[] }> =>
  invoke('batch_stock_count', { input: { counts } })

// ─── Procurement ─────────────────────────────────────────────────────────────

export const createPurchaseOrder = (input: CreatePoInput): Promise<PurchaseOrder> =>
  invoke('create_purchase_order', { input })

export const listPurchaseOrders = (): Promise<PurchaseOrder[]> =>
  invoke('list_purchase_orders')

export const getPurchaseOrder = (poId: string): Promise<PurchaseOrder | null> =>
  invoke('get_purchase_order', { po_id: poId })

// ─── Warehouse ───────────────────────────────────────────────────────────────

export const listTasks = (status?: string): Promise<WarehouseTask[]> =>
  invoke('list_tasks', { status })

export const completeTask = (taskId: string): Promise<{ status: string }> =>
  invoke('complete_task', { task_id: taskId })

export const getBinContents = (binId: string): Promise<StockLevel[]> =>
  invoke('get_bin_contents', { bin_id: binId })

// ─── Peers ───────────────────────────────────────────────────────────────────

export const listPeers = (): Promise<Peer[]> =>
  invoke('list_peers')

export const connectPeer = (inviteCode: string): Promise<{ status: string }> =>
  invoke('connect_peer', { invite_code: inviteCode })

export const getPeerTrust = (peerDid: string): Promise<string | null> =>
  invoke('get_peer_trust', { peer_did: peerDid })

// ─── Chain ───────────────────────────────────────────────────────────────────

export const getChainEvents = (limit?: number, offset?: number): Promise<ChainEvent[]> =>
  invoke('get_chain_events', { limit, offset })

export const getChainHead = (): Promise<ChainHead> =>
  invoke('get_chain_head')
