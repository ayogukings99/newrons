use tauri::State;
use serde::{Deserialize, Serialize};
use scos_protocol::db::NodeDb;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSkuInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub unit_of_measure: Option<String>,
    pub reorder_point: Option<i64>,
    pub economic_order_qty: Option<i64>,
    pub safety_stock: Option<i64>,
}

/// List all SKUs in the local database.
#[tauri::command]
pub async fn list_skus(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    // TODO: query skus table and return rows
    // Placeholder: return empty list
    let _ = db;
    Ok(vec![])
}

/// Create a new SKU — emits a SKU_CREATED event to the source chain.
#[tauri::command]
pub async fn create_sku(
    input: CreateSkuInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO:
    // 1. Load identity from secure store
    // 2. Load source chain from DB
    // 3. chain.append(SKU_CREATED, payload)
    // 4. db.persist_event + db.apply_event
    let _ = (input, state);
    Ok(serde_json::json!({ "status": "ok" }))
}

/// Get current stock levels for all SKUs.
#[tauri::command]
pub async fn get_stock_levels(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    // TODO: query stock_levels JOIN skus JOIN locations
    let _ = db;
    Ok(vec![])
}

/// Adjust stock quantity — emits a STOCK_ADJUSTED event.
#[tauri::command]
pub async fn adjust_stock(
    sku_id: String,
    location_id: String,
    delta: i64,
    reason: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO: emit STOCK_ADJUSTED chain event
    let _ = (sku_id, location_id, delta, reason, state);
    Ok(serde_json::json!({ "status": "ok" }))
}
