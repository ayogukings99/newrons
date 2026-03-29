/// Inventory module — SKU, stock level, and stock event management.
///
/// This module provides all inventory-related operations:
/// - SKU lifecycle (create, list)
/// - Stock level tracking by location
/// - Stock event history
/// - Reorder alerting
/// - Batch stock counting
///
/// All operations emit ChainEvents that are persisted to the source chain
/// and then projected into the SQLite read model.

use serde::{Deserialize, Serialize};
use crate::dag::{SourceChain, ChainEvent, EventType, DagError};
use crate::db::{NodeDb, DbError};
use crate::identity::Identity;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum InventoryError {
    #[error("dag error: {0}")]
    Dag(#[from] DagError),
    #[error("database error: {0}")]
    Db(#[from] DbError),
    #[error("sku not found: {0}")]
    SkuNotFound(String),
    #[error("location not found: {0}")]
    LocationNotFound(String),
    #[error("invalid quantity: {0}")]
    InvalidQuantity(String),
    #[error("insufficient stock at {location}: have {have}, need {need}")]
    InsufficientStock { location: String, have: i64, need: i64 },
}

// ─── Input/Output Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkuInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub unit_of_measure: Option<String>,
    pub reorder_point: Option<i64>,
    pub economic_order_qty: Option<i64>,
    pub safety_stock: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkuRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub unit_of_measure: String,
    pub reorder_point: i64,
    pub economic_order_qty: i64,
    pub safety_stock: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockLevelRow {
    pub sku_id: String,
    pub location_id: String,
    pub qty_on_hand: i64,
    pub qty_reserved: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockEventRow {
    pub id: String,
    pub event_chain_id: String,
    pub sku_id: String,
    pub location_id: String,
    pub delta: i64,
    pub reason: String,
    pub lot_number: Option<String>,
    pub serial_number: Option<String>,
    pub recorded_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderAlert {
    pub sku_id: String,
    pub sku_name: String,
    pub location_id: String,
    pub qty_on_hand: i64,
    pub reorder_point: i64,
    pub qty_to_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountInput {
    pub sku_id: String,
    pub location_id: String,
    pub counted_qty: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountResult {
    pub sku_id: String,
    pub location_id: String,
    pub expected_qty: i64,
    pub counted_qty: i64,
    pub delta: i64,
    pub variance_pct: f64,
}

// ─── Service Functions ───────────────────────────────────────────────────────

/// Create a new SKU and emit a SKU_CREATED event.
pub fn create_sku(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    input: SkuInput,
) -> Result<ChainEvent, InventoryError> {
    let payload = serde_json::json!({
        "id": input.id,
        "name": input.name,
        "description": input.description,
        "unit_of_measure": input.unit_of_measure.unwrap_or_else(|| "EACH".to_string()),
        "reorder_point": input.reorder_point.unwrap_or(0),
        "economic_order_qty": input.economic_order_qty.unwrap_or(0),
        "safety_stock": input.safety_stock.unwrap_or(0),
    });

    let event = chain
        .append(identity, EventType::SkuCreated, payload, None)?
        .clone();

    db.persist_event(&event)?;
    db.apply_event(&event)?;

    Ok(event)
}

/// Record stock receipt at a location and emit a STOCK_RECEIVED event.
pub fn receive_stock(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    sku_id: String,
    location_id: String,
    qty: i64,
) -> Result<ChainEvent, InventoryError> {
    if qty <= 0 {
        return Err(InventoryError::InvalidQuantity(format!(
            "qty must be > 0, got {}",
            qty
        )));
    }

    let payload = serde_json::json!({
        "sku_id": sku_id,
        "location_id": location_id,
        "qty": qty,
    });

    let event = chain
        .append(identity, EventType::StockReceived, payload, None)?
        .clone();

    db.persist_event(&event)?;
    db.apply_event(&event)?;

    Ok(event)
}

/// Adjust stock at a location (increase or decrease) and emit a STOCK_ADJUSTED event.
///
/// Delta can be positive (increase) or negative (decrease).
pub fn adjust_stock(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    sku_id: String,
    location_id: String,
    delta: i64,
    reason: String,
) -> Result<ChainEvent, InventoryError> {
    if delta == 0 {
        return Err(InventoryError::InvalidQuantity(
            "delta cannot be 0".to_string(),
        ));
    }

    let payload = serde_json::json!({
        "sku_id": sku_id,
        "location_id": location_id,
        "delta": delta,
        "reason": reason,
    });

    let event = chain
        .append(identity, EventType::StockAdjusted, payload, None)?
        .clone();

    db.persist_event(&event)?;
    db.apply_event(&event)?;

    Ok(event)
}

/// Transfer stock between two locations and emit a STOCK_TRANSFERRED event.
///
/// This emits a single event that decreases qty at the source location
/// and increases qty at the destination location.
pub fn transfer_stock(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    sku_id: String,
    from_location: String,
    to_location: String,
    qty: i64,
) -> Result<ChainEvent, InventoryError> {
    if qty <= 0 {
        return Err(InventoryError::InvalidQuantity(format!(
            "qty must be > 0, got {}",
            qty
        )));
    }

    let payload = serde_json::json!({
        "sku_id": sku_id,
        "from_location": from_location,
        "to_location": to_location,
        "qty": qty,
    });

    let event = chain
        .append(identity, EventType::StockTransferred, payload, None)?
        .clone();

    db.persist_event(&event)?;
    db.apply_event(&event)?;

    // Also emit STOCK_ADJUSTED events for the read model
    // (the projection engine will handle the actual transfers)
    adjust_stock(
        db,
        chain,
        identity,
        payload["sku_id"].as_str().unwrap_or("").to_string(),
        payload["from_location"].as_str().unwrap_or("").to_string(),
        -(qty),
        "TRANSFER_OUT".to_string(),
    )?;

    adjust_stock(
        db,
        chain,
        identity,
        payload["sku_id"].as_str().unwrap_or("").to_string(),
        payload["to_location"].as_str().unwrap_or("").to_string(),
        qty,
        "TRANSFER_IN".to_string(),
    )?;

    Ok(event)
}

/// Query all SKUs in the database.
pub fn list_skus(db: &NodeDb) -> Result<Vec<SkuRow>, InventoryError> {
    let conn = db.get_connection();
    let mut stmt = conn.prepare(
        "SELECT id, name, description, unit_of_measure, reorder_point,
                economic_order_qty, safety_stock, created_at
         FROM skus
         ORDER BY created_at DESC",
    )?;

    let skus = stmt.query_map([], |row| {
        Ok(SkuRow {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            unit_of_measure: row.get(3)?,
            reorder_point: row.get(4)?,
            economic_order_qty: row.get(5)?,
            safety_stock: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;

    let mut result = Vec::new();
    for sku in skus {
        result.push(sku?);
    }
    Ok(result)
}

/// Query stock levels for a specific SKU across all locations.
pub fn get_stock_levels(db: &NodeDb, sku_id: &str) -> Result<Vec<StockLevelRow>, InventoryError> {
    let conn = db.get_connection();
    let mut stmt = conn.prepare(
        "SELECT sku_id, location_id, qty_on_hand, qty_reserved, updated_at
         FROM stock_levels
         WHERE sku_id = ?1
         ORDER BY location_id ASC",
    )?;

    let rows = stmt.query_map([sku_id], |row| {
        Ok(StockLevelRow {
            sku_id: row.get(0)?,
            location_id: row.get(1)?,
            qty_on_hand: row.get(2)?,
            qty_reserved: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

/// Query stock event history for a specific SKU.
pub fn get_stock_history(
    db: &NodeDb,
    sku_id: &str,
    limit: i64,
) -> Result<Vec<StockEventRow>, InventoryError> {
    let conn = db.get_connection();
    let mut stmt = conn.prepare(
        "SELECT id, event_chain_id, sku_id, location_id, delta, reason,
                lot_number, serial_number, recorded_at
         FROM stock_events
         WHERE sku_id = ?1
         ORDER BY recorded_at DESC
         LIMIT ?2",
    )?;

    let rows = stmt.query_map([sku_id, &limit.to_string()], |row| {
        Ok(StockEventRow {
            id: row.get(0)?,
            event_chain_id: row.get(1)?,
            sku_id: row.get(2)?,
            location_id: row.get(3)?,
            delta: row.get(4)?,
            reason: row.get(5)?,
            lot_number: row.get(6)?,
            serial_number: row.get(7)?,
            recorded_at: row.get(8)?,
        })
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

/// Check for reorder alerts: SKUs where qty_on_hand <= reorder_point.
pub fn check_reorder_alerts(db: &NodeDb) -> Result<Vec<ReorderAlert>, InventoryError> {
    let conn = db.get_connection();
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, sl.location_id, sl.qty_on_hand, s.reorder_point, s.economic_order_qty
         FROM stock_levels sl
         JOIN skus s ON sl.sku_id = s.id
         WHERE sl.qty_on_hand <= s.reorder_point
         ORDER BY s.id, sl.location_id",
    )?;

    let rows = stmt.query_map([], |row| {
        let reorder_point: i64 = row.get(4)?;
        let qty_on_hand: i64 = row.get(3)?;
        let eoq: i64 = row.get(5)?;

        Ok(ReorderAlert {
            sku_id: row.get(0)?,
            sku_name: row.get(1)?,
            location_id: row.get(2)?,
            qty_on_hand,
            reorder_point,
            qty_to_order: eoq,
        })
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

/// Perform a batch stock count (cycle count or physical inventory).
///
/// For each counted SKU/location, compares the counted quantity against the
/// system quantity and emits a STOCK_ADJUSTED event if there's a variance.
pub fn batch_stock_count(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    counts: Vec<CountInput>,
) -> Result<Vec<CountResult>, InventoryError> {
    let mut results = Vec::new();

    for count in counts {
        // Get current stock level from DB
        let conn = db.get_connection();
        let current_qty: i64 = conn
            .query_row(
                "SELECT COALESCE(qty_on_hand, 0) FROM stock_levels
                 WHERE sku_id = ?1 AND location_id = ?2",
                rusqlite::params![&count.sku_id, &count.location_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let delta = count.counted_qty - current_qty;
        let variance_pct = if current_qty == 0 {
            if count.counted_qty == 0 {
                0.0
            } else {
                100.0
            }
        } else {
            ((delta as f64) / (current_qty as f64)) * 100.0
        };

        // Emit STOCK_ADJUSTED if there's a variance
        if delta != 0 {
            adjust_stock(
                db,
                chain,
                identity,
                count.sku_id.clone(),
                count.location_id.clone(),
                delta,
                "COUNT".to_string(),
            )?;
        }

        results.push(CountResult {
            sku_id: count.sku_id,
            location_id: count.location_id,
            expected_qty: current_qty,
            counted_qty: count.counted_qty,
            delta,
            variance_pct,
        });
    }

    Ok(results)
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;
    use crate::dag::SourceChain;

    #[test]
    fn test_create_sku() {
        let db = NodeDb::open_in_memory().unwrap();
        let id = Identity::generate().unwrap();
        let mut chain = SourceChain::genesis(&id).unwrap();

        let input = SkuInput {
            id: "SKU-001".to_string(),
            name: "Widget A".to_string(),
            description: Some("A fine widget".to_string()),
            unit_of_measure: Some("EACH".to_string()),
            reorder_point: Some(10),
            economic_order_qty: Some(100),
            safety_stock: Some(5),
        };

        let event = create_sku(&db, &mut chain, &id, input).unwrap();
        assert_eq!(event.event_type, EventType::SkuCreated);
    }
}
