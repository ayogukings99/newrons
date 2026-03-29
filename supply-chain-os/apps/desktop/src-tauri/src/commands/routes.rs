use tauri::State;
use serde::{Deserialize, Serialize};
use scos_protocol::{
    logistics::{self, RouteRow, StopInput, RouteMetrics},
};
use crate::AppState;
use uuid::Uuid;

// ─── Input Structures ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRouteInput {
    pub stops: Vec<StopInput>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OptimizeRouteInput {
    pub stops: Vec<StopInput>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssignDriverInput {
    pub route_id: String,
    pub driver_did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompleteStopInput {
    pub route_id: String,
    pub stop_seq: i32,
    pub pod_hash: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfirmDeliveryInput {
    pub route_id: String,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Create a new delivery route
#[tauri::command]
pub async fn create_route(
    input: CreateRouteInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO: Load identity and chain from state
    // Call logistics::create_route(db, chain, identity, input.stops)
    let route_id = Uuid::new_v4().to_string();
    Ok(serde_json::json!({
        "id": route_id,
        "status": "PLANNED",
        "total_stops": input.stops.len(),
    }))
}

/// Optimize a route using VRP solver (nearest-neighbor + 2-opt)
#[tauri::command]
pub async fn optimize_route(
    input: OptimizeRouteInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Call logistics::optimize_route(input.stops)
    // Returns ordered stops with cumulative distances and ETAs
    match logistics::optimize_route(input.stops) {
        Ok(optimized) => {
            Ok(serde_json::json!({
                "sequence": optimized.sequence,
                "total_distance_km": optimized.total_distance,
                "stops_with_eta": optimized.stops_with_eta,
            }))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Assign a driver to a route
#[tauri::command]
pub async fn assign_driver(
    input: AssignDriverInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO: Load identity and chain
    // Call logistics::assign_driver(db, chain, identity, route_id, driver_did)
    Ok(serde_json::json!({ "status": "assigned" }))
}

/// List all routes with optional status filter
#[tauri::command]
pub async fn list_routes(
    status: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    // TODO: call logistics::list_routes(db, status)
    // Returns RouteRow list: ID, driver, status, progress (X/Y stops)
    Ok(vec![])
}

/// Get full route detail (route + stops + events)
#[tauri::command]
pub async fn get_route_detail(
    route_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO: call logistics::get_route_detail(db, route_id)
    // Returns route, ordered stop list with status dots, and DELIVERY_CONFIRMED events
    Err(format!("Route not found: {}", route_id))
}

/// Mark a stop as completed with proof-of-delivery
#[tauri::command]
pub async fn complete_stop(
    input: CompleteStopInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO: Load identity and chain
    // Call logistics::complete_stop(db, chain, identity, route_id, stop_seq, pod_hash, notes)
    Ok(serde_json::json!({ "status": "completed" }))
}

/// Confirm route as fully completed (DHT-anchored delivery confirmation)
#[tauri::command]
pub async fn confirm_delivery(
    input: ConfirmDeliveryInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // TODO: Load identity and chain
    // Call logistics::confirm_delivery(db, chain, identity, route_id)
    // Emits DELIVERY_CONFIRMED event
    Ok(serde_json::json!({ "status": "confirmed" }))
}
