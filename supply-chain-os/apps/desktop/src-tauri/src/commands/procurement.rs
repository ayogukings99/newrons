use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;

/// Input wrapper for create PO command (matches Tauri serialization needs)
#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePurchaseOrderInput {
    pub supplier_did: String,
    pub line_items: Vec<CreateLineItemInput>,
    pub expected_delivery: Option<i64>,
    pub currency: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateLineItemInput {
    pub sku_id: String,
    pub qty: i64,
    pub unit_price: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiveShipmentInput {
    pub po_id: String,
    pub received_items: Vec<ReceiveLineItemInput>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiveLineItemInput {
    pub sku_id: String,
    pub qty_received: i64,
}

// Re-export protocol types for Tauri serialization
use protocol::PurchaseOrder;
use protocol::PoDetail;
use protocol::SupplierScorecard;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcurementResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ProcurementResponse<T> {
    fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn err(error: String) -> ProcurementResponse<()> {
        ProcurementResponse {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

/// Create and issue a Purchase Order — emits PO_ISSUED to the source chain,
/// then P2P sends the signed event to the supplier node for their countersignature.
#[tauri::command]
pub async fn create_purchase_order(
    input: CreatePurchaseOrderInput,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<PurchaseOrder>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let mut chain = state
        .chain
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let identity = state
        .identity
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    // Convert input to protocol types
    let proto_input = protocol::CreatePoInput {
        supplier_did: input.supplier_did,
        line_items: input
            .line_items
            .into_iter()
            .map(|li| protocol::LineItemInput {
                sku_id: li.sku_id,
                qty: li.qty,
                unit_price: li.unit_price,
            })
            .collect(),
        expected_delivery: input.expected_delivery,
        currency: input.currency,
    };

    match protocol::procurement::create_po(&db, &mut chain, &identity, proto_input) {
        Ok(po) => Ok(ProcurementResponse::ok(po)),
        Err(e) => Ok(ProcurementResponse::<PurchaseOrder> {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}

/// Confirm a PO — attach supplier signature to PO_ISSUED event.
#[tauri::command]
pub async fn confirm_purchase_order(
    po_id: String,
    supplier_sig: String,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<()>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let mut chain = state
        .chain
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    match protocol::procurement::confirm_po(&db, &mut chain, &po_id, supplier_sig) {
        Ok(_) => Ok(ProcurementResponse::ok(())),
        Err(e) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}

/// Cancel a PO (only allowed before shipment).
#[tauri::command]
pub async fn cancel_purchase_order(
    po_id: String,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<()>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let mut chain = state
        .chain
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let identity = state
        .identity
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    match protocol::procurement::cancel_po(&db, &mut chain, &identity, &po_id) {
        Ok(_) => Ok(ProcurementResponse::ok(())),
        Err(e) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}

/// Record shipment — emit SHIPMENT_SENT event.
#[tauri::command]
pub async fn record_shipment(
    po_id: String,
    tracking: String,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<()>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let mut chain = state
        .chain
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let identity = state
        .identity
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    match protocol::procurement::record_shipment(&db, &mut chain, &identity, &po_id, tracking) {
        Ok(_) => Ok(ProcurementResponse::ok(())),
        Err(e) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}

/// Receive shipment — emit SHIPMENT_RECEIVED + STOCK_RECEIVED per line item.
#[tauri::command]
pub async fn receive_shipment(
    input: ReceiveShipmentInput,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<()>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let mut chain = state
        .chain
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let identity = state
        .identity
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    let received_items = input
        .received_items
        .into_iter()
        .map(|ri| protocol::ReceivedItem {
            sku_id: ri.sku_id,
            qty_received: ri.qty_received,
        })
        .collect();

    match protocol::procurement::receive_shipment(
        &db,
        &mut chain,
        &identity,
        &input.po_id,
        received_items,
    ) {
        Ok(_) => Ok(ProcurementResponse::ok(())),
        Err(e) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}

/// List all purchase orders.
#[tauri::command]
pub async fn list_purchase_orders(
    status_filter: Option<String>,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<Vec<PurchaseOrder>>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    match protocol::procurement::list_pos(&db, status_filter) {
        Ok(pos) => Ok(ProcurementResponse::ok(pos)),
        Err(e) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}

/// Get a single purchase order with line items and status timeline.
#[tauri::command]
pub async fn get_purchase_order(
    po_id: String,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<PoDetail>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    match protocol::procurement::get_po_detail(&db, &po_id) {
        Ok(Some(detail)) => Ok(ProcurementResponse::ok(detail)),
        Ok(None) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("PO not found: {}", po_id)),
        }),
        Err(e) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}

/// Get supplier scorecard.
#[tauri::command]
pub async fn get_supplier_scorecard(
    supplier_did: String,
    state: State<'_, AppState>,
) -> Result<ProcurementResponse<SupplierScorecard>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("lock error: {}", e))?;

    match protocol::procurement::get_supplier_scorecard(&db, &supplier_did) {
        Ok(scorecard) => Ok(ProcurementResponse::ok(scorecard)),
        Err(e) => Ok(ProcurementResponse {
            success: false,
            data: None,
            error: Some(format!("{:?}", e)),
        }),
    }
}
