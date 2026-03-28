/// Shared TypeScript types for Supply Chain OS.
///
/// These mirror the Rust structs in scos-protocol exactly.
/// Any change to the Rust event format MUST be reflected here.

// ─── Identity ────────────────────────────────────────────────────────────────

export interface IdentityResult {
  did: string
  is_new: boolean
}

export interface NodeProfile {
  did: string
  public_key_hex: string
  display_name?: string
  protocol_version: string
}

// ─── Event Types ─────────────────────────────────────────────────────────────

export type EventType =
  | 'GENESIS'
  | 'NODE_UPDATED'
  | 'SKU_CREATED'
  | 'SKU_UPDATED'
  | 'STOCK_RECEIVED'
  | 'STOCK_ADJUSTED'
  | 'STOCK_TRANSFERRED'
  | 'REORDER_TRIGGERED'
  | 'PO_ISSUED'
  | 'PO_CONFIRMED'
  | 'PO_AMENDED'
  | 'PO_CANCELLED'
  | 'SHIPMENT_SENT'
  | 'SHIPMENT_RECEIVED'
  | 'INVOICE_SUBMITTED'
  | 'INVOICE_MATCHED'
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETED'
  | 'BIN_UPDATED'
  | 'CYCLE_COUNT_STARTED'
  | 'CYCLE_COUNT_COMPLETED'
  | 'ROUTE_CREATED'
  | 'ROUTE_OPTIMIZED'
  | 'STOP_COMPLETED'
  | 'DELIVERY_CONFIRMED'
  | 'INSPECTION_STARTED'
  | 'ITEM_INSPECTED'
  | 'BATCH_PASSED'
  | 'BATCH_FAILED'
  | 'NCR_RAISED'
  | 'NCR_RESOLVED'
  | 'FORECAST_RUN_COMPLETED'
  | 'MODEL_UPDATED'
  | 'PEER_CONNECTED'
  | 'PEER_TRUST_UPDATED'
  | 'PEER_DISCONNECTED'

export interface ChainEvent {
  id: string
  version: string
  event_type: EventType
  author: string
  prev_hash: string
  payload: Record<string, unknown>
  signature: string
  timestamp: number
  counterparty?: string
  their_sig?: string
  dht_anchor?: string
}

export interface ChainHead {
  length: number
  head?: ChainEvent
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export interface Sku {
  id: string
  name: string
  description?: string
  unit_of_measure: string
  reorder_point: number
  economic_order_qty: number
  safety_stock: number
  created_at: number
}

export interface Location {
  id: string
  name: string
  location_type: 'WAREHOUSE' | 'STORE' | 'TRANSIT' | 'SUPPLIER'
  address?: string
  created_at: number
}

export interface StockLevel {
  sku_id: string
  location_id: string
  qty_on_hand: number
  qty_reserved: number
  updated_at: number
}

export interface StockEvent {
  id: string
  event_chain_id: string
  sku_id: string
  location_id: string
  delta: number
  reason: string
  lot_number?: string
  serial_number?: string
  recorded_at: number
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export type PoStatus = 'DRAFT' | 'ISSUED' | 'CONFIRMED' | 'SHIPPED' | 'RECEIVED' | 'CANCELLED'

export interface PoLineItemInput {
  sku_id: string
  qty: number
  unit_price: number
}

export interface CreatePoInput {
  supplier_did: string
  line_items: PoLineItemInput[]
  expected_delivery?: number
  currency?: string
}

export interface PurchaseOrder {
  id: string
  supplier_did: string
  status: PoStatus
  total_value: number
  currency: string
  expected_delivery?: number
  confirmed_at?: number
  shipped_at?: number
  received_at?: number
  created_at: number
  line_items?: PurchaseOrderLineItem[]
}

export interface PurchaseOrderLineItem {
  id: string
  po_id: string
  sku_id: string
  qty_ordered: number
  unit_price: number
  qty_received: number
}

// ─── Warehouse ───────────────────────────────────────────────────────────────

export type TaskType = 'PICK' | 'PUT' | 'TRANSFER' | 'COUNT' | 'RECEIVE'
export type TaskStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED'

export interface WarehouseTask {
  id: string
  task_type: TaskType
  sku_id?: string
  from_bin?: string
  to_bin?: string
  qty: number
  status: TaskStatus
  assigned_to?: string
  created_at: number
  completed_at?: number
}

// ─── Routes / Delivery ───────────────────────────────────────────────────────

export type RouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface DeliveryRoute {
  id: string
  driver_did?: string
  status: RouteStatus
  total_stops: number
  completed_stops: number
  created_at: number
  completed_at?: number
}

// ─── Inspection ──────────────────────────────────────────────────────────────

export type InspectionResult = 'PASS' | 'FAIL' | 'CONDITIONAL'
export type DefectType = 'CRITICAL' | 'MAJOR' | 'MINOR'
export type AqlLevel = 'TIGHTENED' | 'NORMAL' | 'REDUCED'

export interface InspectionBatch {
  id: string
  po_id?: string
  supplier_did?: string
  status: 'IN_PROGRESS' | 'COMPLETE'
  aql_level: AqlLevel
  sample_size: number
  defects_found: number
  result?: InspectionResult
  created_at: number
  completed_at?: number
}

export interface InspectionItem {
  id: string
  batch_id: string
  sku_id?: string
  result: InspectionResult
  defect_type?: DefectType
  notes?: string
  photo_hash?: string
  inspected_at: number
}

// ─── Peers ───────────────────────────────────────────────────────────────────

export type TrustLevel = 'UNTRUSTED' | 'PENDING' | 'TRADING' | 'VERIFIED' | 'AUDITOR'

export interface Peer {
  peer_did: string
  display_name?: string
  trust_level: TrustLevel
  connected_at: number
  last_seen_at?: number
}
