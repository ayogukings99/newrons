use tauri::State;
use serde::{Deserialize, Serialize};
use scos_protocol::{
    db::NodeDb,
    dag::SourceChain,
    identity::Identity,
    inventory::{self, SkuInput},
};
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

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchCountInput {
    pub counts: Vec<BatchCountItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchCountItem {
    pub sku_id: String,
    pub location_id: String,
    pub counted_qty: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiveStockInput {
    pub sku_id: String,
    pub location_id: String,
    pub qty: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransferStockInput {
    pub sku_id: String,
    pub from_location: String,
    pub to_location: String,
    pub qty: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AdjustStockInput {
    pub sku_id: String,
    pub location_id: String,
    pub delta: i64,
    pub reason: String,
}

/// List all SKUs in the local database.
#[tauri::command]
pub async fn list_skus(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;

    let skus = inventory::list_skus(&db).map_err(|e| e.to_string())?;
    let result: Vec<serde_json::Value> = skus
        .into_iter()
        .map(|sku| {
            serde_json::json!({
                "id": sku.id,
                "name": sku.name,
                "description": sku.description,
                "unit_of_measure": sku.unit_of_measure,
                "reorder_point": sku.reorder_point,
                "economic_order_qty": sku.economic_order_qty,
                "safety_stock": sku.safety_stock,
                "created_at": sku.created_at,
            })
        })
        .collect();

    Ok(serde_json::json!({ "skus": result }))
}

/// Create a new SKU — emits a SKU_CREATED event to the source chain.
#[tauri::command]
pub async fn create_sku(
    input: CreateSkuInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Load DB and chain
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;

    // Load identity from secure store (hardcoded for now — would use tauri_plugin_store in production)
    let identity = Identity::generate().map_err(|e| e.to_string())?;

    // Load source chain
    let events = db.load_all_events().map_err(|e| e.to_string())?;
    let chain_events: Vec<_> = events
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    let mut chain = if chain_events.is_empty() {
        SourceChain::genesis(&identity).map_err(|e| e.to_string())?
    } else {
        SourceChain::from_events(chain_events).map_err(|e| e.to_string())?
    };

    // Create SKU
    let sku_input = SkuInput {
        id: input.id,
        name: input.name,
        description: input.description,
        unit_of_measure: input.unit_of_measure,
        reorder_point: input.reorder_point,
        economic_order_qty: input.economic_order_qty,
        safety_stock: input.safety_stock,
    };

    let event = inventory::create_sku(&db, &mut chain, &identity, sku_input)
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "status": "ok",
        "event_id": event.id,
        "timestamp": event.timestamp,
    }))
}

/// Get current stock levels for a specific SKU.
#[tauri::command]
pub async fn get_stock_levels(
    sku_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;

    let levels = inventory::get_stock_levels(&db, &sku_id).map_err(|e| e.to_string())?;
    let result: Vec<serde_json::Value> = levels
        .into_iter()
        .map(|level| {
            serde_json::json!({
                "sku_id": level.sku_id,
                "location_id": level.location_id,
                "qty_on_hand": level.qty_on_hand,
                "qty_reserved": level.qty_reserved,
                "updated_at": level.updated_at,
            })
        })
        .collect();

    Ok(serde_json::json!({ "levels": result }))
}

/// Get stock event history for a SKU.
#[tauri::command]
pub async fn get_stock_history(
    sku_id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);

    let events = inventory::get_stock_history(&db, &sku_id, lim).map_err(|e| e.to_string())?;
    let result: Vec<serde_json::Value> = events
        .into_iter()
        .map(|evt| {
            serde_json::json!({
                "id": evt.id,
                "event_chain_id": evt.event_chain_id,
                "sku_id": evt.sku_id,
                "location_id": evt.location_id,
                "delta": evt.delta,
                "reason": evt.reason,
                "lot_number": evt.lot_number,
                "serial_number": evt.serial_number,
                "recorded_at": evt.recorded_at,
            })
        })
        .collect();

    Ok(serde_json::json!({ "history": result }))
}

/// Adjust stock quantity — emits a STOCK_ADJUSTED event.
#[tauri::command]
pub async fn adjust_stock(
    input: AdjustStockInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    let identity = Identity::generate().map_err(|e| e.to_string())?;

    let events = db.load_all_events().map_err(|e| e.to_string())?;
    let chain_events: Vec<_> = events
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    let mut chain = if chain_events.is_empty() {
        SourceChain::genesis(&identity).map_err(|e| e.to_string())?
    } else {
        SourceChain::from_events(chain_events).map_err(|e| e.to_string())?
    };

    let event = inventory::adjust_stock(
        &db,
        &mut chain,
        &identity,
        input.sku_id,
        input.location_id,
        input.delta,
        input.reason,
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "status": "ok",
        "event_id": event.id,
        "timestamp": event.timestamp,
    }))
}

/// Receive stock at a location.
#[tauri::command]
pub async fn receive_stock(
    input: ReceiveStockInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    let identity = Identity::generate().map_err(|e| e.to_string())?;

    let events = db.load_all_events().map_err(|e| e.to_string())?;
    let chain_events: Vec<_> = events
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    let mut chain = if chain_events.is_empty() {
        SourceChain::genesis(&identity).map_err(|e| e.to_string())?
    } else {
        SourceChain::from_events(chain_events).map_err(|e| e.to_string())?
    };

    let event = inventory::receive_stock(
        &db,
        &mut chain,
        &identity,
        input.sku_id,
        input.location_id,
        input.qty,
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "status": "ok",
        "event_id": event.id,
        "timestamp": event.timestamp,
    }))
}

/// Transfer stock between locations.
#[tauri::command]
pub async fn transfer_stock(
    input: TransferStockInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    let identity = Identity::generate().map_err(|e| e.to_string())?;

    let events = db.load_all_events().map_err(|e| e.to_string())?;
    let chain_events: Vec<_> = events
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    let mut chain = if chain_events.is_empty() {
        SourceChain::genesis(&identity).map_err(|e| e.to_string())?
    } else {
        SourceChain::from_events(chain_events).map_err(|e| e.to_string())?
    };

    let event = inventory::transfer_stock(
        &db,
        &mut chain,
        &identity,
        input.sku_id,
        input.from_location,
        input.to_location,
        input.qty,
    )
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "status": "ok",
        "event_id": event.id,
        "timestamp": event.timestamp,
    }))
}

/// Check for reorder alerts.
#[tauri::command]
pub async fn check_reorder_alerts(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;

    let alerts = inventory::check_reorder_alerts(&db).map_err(|e| e.to_string())?;
    let result: Vec<serde_json::Value> = alerts
        .into_iter()
        .map(|alert| {
            serde_json::json!({
                "sku_id": alert.sku_id,
                "sku_name": alert.sku_name,
                "location_id": alert.location_id,
                "qty_on_hand": alert.qty_on_hand,
                "reorder_point": alert.reorder_point,
                "qty_to_order": alert.qty_to_order,
            })
        })
        .collect();

    Ok(serde_json::json!({ "alerts": result }))
}

/// Perform batch stock count (cycle count).
#[tauri::command]
pub async fn batch_stock_count(
    input: BatchCountInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    let identity = Identity::generate().map_err(|e| e.to_string())?;

    let events = db.load_all_events().map_err(|e| e.to_string())?;
    let chain_events: Vec<_> = events
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect();

    let mut chain = if chain_events.is_empty() {
        SourceChain::genesis(&identity).map_err(|e| e.to_string())?
    } else {
        SourceChain::from_events(chain_events).map_err(|e| e.to_string())?
    };

    let count_inputs: Vec<_> = input
        .counts
        .into_iter()
        .map(|c| inventory::CountInput {
            sku_id: c.sku_id,
            location_id: c.location_id,
            counted_qty: c.counted_qty,
        })
        .collect();

    let results = inventory::batch_stock_count(&db, &mut chain, &identity, count_inputs)
        .map_err(|e| e.to_string())?;

    let result: Vec<serde_json::Value> = results
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "sku_id": r.sku_id,
                "location_id": r.location_id,
                "expected_qty": r.expected_qty,
                "counted_qty": r.counted_qty,
                "delta": r.delta,
                "variance_pct": r.variance_pct,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "status": "ok",
        "results": result,
    }))
}
