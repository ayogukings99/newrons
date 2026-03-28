use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePoInput {
    pub supplier_did: String,
    pub line_items: Vec<PoLineItem>,
    pub expected_delivery: Option<i64>,
    pub currency: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PoLineItem {
    pub sku_id: String,
    pub qty: i64,
    pub unit_price: f64,
}

/// Create and issue a Purchase Order — emits PO_ISSUED to the source chain,
/// then P2P sends the signed event to the supplier node for their countersignature.
#[tauri::command]
pub async fn create_purchase_order(
    input: CreatePoInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO:
    // 1. Append PO_ISSUED to local chain
    // 2. P2P send to supplier_did node
    // 3. Await PO_CONFIRMED event from supplier
    let _ = (input, state);
    Ok(serde_json::json!({ "po_id": uuid::Uuid::new_v4().to_string(), "status": "ISSUED" }))
}

/// List all purchase orders.
#[tauri::command]
pub async fn list_purchase_orders(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let _ = state;
    Ok(vec![])
}

/// Get a single purchase order with line items.
#[tauri::command]
pub async fn get_purchase_order(
    po_id: String,
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let _ = (po_id, state);
    Ok(None)
}
