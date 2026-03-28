use tauri::State;
use scos_protocol::db::NodeDb;
use crate::AppState;

/// Return all source chain events (for the event log inspector UI).
#[tauri::command]
pub async fn get_chain_events(
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    let events = db.load_all_events().map_err(|e| e.to_string())?;
    let offset = offset.unwrap_or(0) as usize;
    let limit = limit.unwrap_or(100) as usize;
    Ok(events.into_iter().skip(offset).take(limit).collect())
}

/// Return the hash and index of the most recent event (chain head).
#[tauri::command]
pub async fn get_chain_head(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = NodeDb::open(&state.db_path).map_err(|e| e.to_string())?;
    let events = db.load_all_events().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "length": events.len(),
        "head": events.last().cloned()
    }))
}
