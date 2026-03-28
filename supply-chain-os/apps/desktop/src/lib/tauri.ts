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

export const listSkus = (): Promise<Sku[]> =>
  invoke('list_skus')

export const createSku = (input: Omit<Sku, 'created_at'>): Promise<{ status: string }> =>
  invoke('create_sku', { input })

export const getStockLevels = (): Promise<StockLevel[]> =>
  invoke('get_stock_levels')

export const adjustStock = (args: {
  skuId: string
  locationId: string
  delta: number
  reason: string
}): Promise<{ status: string }> =>
  invoke('adjust_stock', {
    sku_id: args.skuId,
    location_id: args.locationId,
    delta: args.delta,
    reason: args.reason,
  })

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
