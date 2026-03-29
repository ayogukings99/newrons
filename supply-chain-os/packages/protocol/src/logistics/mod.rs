/// Logistics & Route Management — VRP solving, delivery tracking, stop completion
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use thiserror::Error;

use crate::dag::{SourceChain, EventType, ChainEvent};
use crate::db::NodeDb;
use crate::identity::Identity;

pub mod vrp;
use vrp::{Stop, OptimizedRoute};

// ─── Errors ──────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum LogisticsError {
    #[error("route not found: {0}")]
    RouteNotFound(String),
    #[error("invalid stop sequence")]
    InvalidStopSequence,
    #[error("database error: {0}")]
    DbError(String),
    #[error("chain error: {0}")]
    ChainError(String),
    #[error("vrp error: {0}")]
    VrpError(String),
}

// ─── Data Structures ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteRow {
    pub id: String,
    pub driver_did: Option<String>,
    pub status: String,
    pub total_stops: i64,
    pub completed_stops: i64,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDetail {
    pub route: RouteRow,
    pub stops: Vec<StopDetail>,
    pub events: Vec<ChainEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopDetail {
    pub sequence: i32,
    pub location_id: Option<String>,
    pub lat: f64,
    pub lng: f64,
    pub status: String,
    pub notes: Option<String>,
    pub recorded_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteMetrics {
    pub total_distance_km: f64,
    pub estimated_hours: f64,
    pub avg_stop_time_min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopInput {
    pub location_id: Option<String>,
    pub lat: f64,
    pub lng: f64,
    pub demand: i32, // items to deliver/pickup
}

// ─── Service Functions ───────────────────────────────────────────────────────

/// Create a new delivery route
pub fn create_route(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    stops: Vec<StopInput>,
) -> Result<ChainEvent, LogisticsError> {
    let route_id = Uuid::new_v4().to_string();

    let payload = serde_json::json!({
        "route_id": route_id,
        "stops": stops,
    });

    let event = chain
        .append(identity, EventType::RouteCreated, payload, None)
        .map_err(|e| LogisticsError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;

    Ok(event)
}

/// Optimize a route using nearest-neighbor + 2-opt VRP solver
pub fn optimize_route(stops: Vec<StopInput>) -> Result<OptimizedRoute, LogisticsError> {
    // Convert StopInput to internal Stop format
    let internal_stops: Vec<Stop> = stops
        .into_iter()
        .enumerate()
        .map(|(idx, s)| Stop {
            id: s.location_id.unwrap_or_else(|| idx.to_string()),
            lat: s.lat,
            lng: s.lng,
            demand: s.demand,
            time_window: None,
        })
        .collect();

    // Assume depot is first stop
    let depot_idx = 0;
    let capacity = 100; // Default truck capacity

    vrp::solve(depot_idx, internal_stops, capacity)
        .map_err(|e| LogisticsError::VrpError(e.to_string()))
}

/// Assign a driver to a route
pub fn assign_driver(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    route_id: String,
    driver_did: String,
) -> Result<(), LogisticsError> {
    let payload = serde_json::json!({
        "route_id": route_id,
        "driver_did": driver_did,
    });

    let event = chain
        .append(identity, EventType::RouteCreated, payload, None)
        .map_err(|e| LogisticsError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;

    Ok(())
}

/// Mark a stop as completed with proof-of-delivery
pub fn complete_stop(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    route_id: String,
    stop_seq: i32,
    pod_hash: String, // Proof of delivery (photo hash or signature hash)
    notes: Option<String>,
) -> Result<ChainEvent, LogisticsError> {
    let payload = serde_json::json!({
        "route_id": route_id,
        "stop_seq": stop_seq,
        "pod_hash": pod_hash,
        "notes": notes,
    });

    let event = chain
        .append(identity, EventType::StopCompleted, payload, None)
        .map_err(|e| LogisticsError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;

    Ok(event)
}

/// Mark delivery route as fully completed (DHT-anchored)
pub fn confirm_delivery(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    route_id: String,
) -> Result<ChainEvent, LogisticsError> {
    let payload = serde_json::json!({
        "route_id": route_id,
    });

    let event = chain
        .append(identity, EventType::DeliveryConfirmed, payload, None)
        .map_err(|e| LogisticsError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| LogisticsError::DbError(e.to_string()))?;

    Ok(event)
}

/// List routes with optional status filter
pub fn list_routes(db: &NodeDb, status: Option<String>) -> Result<Vec<RouteRow>, LogisticsError> {
    // Query delivery_routes WHERE status = ? (or all if no filter)
    Ok(vec![]) // Placeholder
}

/// Get full route details including stops and events
pub fn get_route_detail(db: &NodeDb, route_id: String) -> Result<RouteDetail, LogisticsError> {
    // Query route, stops, and associated events
    Err(LogisticsError::RouteNotFound(route_id))
}

/// Compute route metrics (distance, time, avg stop duration)
pub fn get_route_metrics(stops: &[StopDetail]) -> RouteMetrics {
    // Compute total distance via haversine between consecutive stops
    let mut total_distance = 0.0;
    for i in 0..stops.len() - 1 {
        total_distance += vrp::haversine_km(
            stops[i].lat,
            stops[i].lng,
            stops[i + 1].lat,
            stops[i + 1].lng,
        );
    }

    // Estimate hours: assume 50 km/h avg speed
    let estimated_hours = total_distance / 50.0;
    // Assume 10 min per stop
    let avg_stop_time_min = 10.0;

    RouteMetrics {
        total_distance_km: total_distance,
        estimated_hours,
        avg_stop_time_min,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stop_input_to_internal_format() {
        let inputs = vec![
            StopInput {
                location_id: Some("A".to_string()),
                lat: 0.0,
                lng: 0.0,
                demand: 5,
            },
            StopInput {
                location_id: Some("B".to_string()),
                lat: 1.0,
                lng: 1.0,
                demand: 3,
            },
        ];

        // Should convert without error
        let _: Vec<Stop> = inputs
            .into_iter()
            .enumerate()
            .map(|(idx, s)| Stop {
                id: s.location_id.unwrap_or_else(|| idx.to_string()),
                lat: s.lat,
                lng: s.lng,
                demand: s.demand,
                time_window: None,
            })
            .collect();
    }
}
