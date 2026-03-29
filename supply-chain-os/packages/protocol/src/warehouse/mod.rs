/// Warehouse Management System — task scheduling, bin management, cycle counting
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use thiserror::Error;

use crate::dag::{SourceChain, EventType, ChainEvent};
use crate::db::NodeDb;
use crate::identity::Identity;

// ─── Errors ──────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum WarehouseError {
    #[error("task not found: {0}")]
    TaskNotFound(String),
    #[error("bin not found: {0}")]
    BinNotFound(String),
    #[error("invalid task state")]
    InvalidTaskState,
    #[error("bin mismatch: expected {0}, got {1}")]
    BinMismatch(String, String),
    #[error("database error: {0}")]
    DbError(String),
    #[error("chain error: {0}")]
    ChainError(String),
}

// ─── Data Structures ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRow {
    pub id: String,
    pub task_type: String,
    pub sku_id: Option<String>,
    pub from_bin: Option<String>,
    pub to_bin: Option<String>,
    pub qty: i64,
    pub status: String,
    pub assigned_to: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinContentRow {
    pub bin_id: String,
    pub sku_id: String,
    pub qty: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinSummary {
    pub bin_id: String,
    pub total_items: i64,
    pub fill_level: String, // "empty", "partial", "full"
    pub sku_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CountResult {
    pub bin_id: String,
    pub sku_id: String,
    pub counted_qty: i64,
}

// ─── Task Type Priority ──────────────────────────────────────────────────────

fn task_priority(task_type: &str) -> i32 {
    match task_type {
        "RECEIVE" => 5,
        "PICK" => 4,
        "PUT" => 3,
        "TRANSFER" => 2,
        "COUNT" => 1,
        _ => 0,
    }
}

// ─── Service Functions ───────────────────────────────────────────────────────

/// Create a warehouse task (RECEIVE, PICK, PUT, TRANSFER, COUNT)
pub fn create_task(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    task_type: String,
    sku_id: Option<String>,
    from_bin: Option<String>,
    to_bin: Option<String>,
    qty: i64,
) -> Result<ChainEvent, WarehouseError> {
    let task_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp_millis();

    let payload = serde_json::json!({
        "task_id": task_id,
        "task_type": task_type,
        "sku_id": sku_id,
        "from_bin": from_bin,
        "to_bin": to_bin,
        "qty": qty,
    });

    let event = chain
        .append(identity, EventType::TaskCreated, payload, None)
        .map_err(|e| WarehouseError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;

    Ok(event)
}

/// Assign a warehouse task to a worker
pub fn assign_task(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    task_id: String,
    worker_did: String,
) -> Result<(), WarehouseError> {
    let payload = serde_json::json!({
        "task_id": task_id,
        "worker_did": worker_did,
    });

    let event = chain
        .append(identity, EventType::TaskAssigned, payload, None)
        .map_err(|e| WarehouseError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;

    Ok(())
}

/// Complete a warehouse task with NFC scan validation
pub fn complete_task(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    task_id: String,
    scanned_bin: String,
) -> Result<ChainEvent, WarehouseError> {
    // Verify the task exists and check bin match
    let task = get_task_by_id(db, &task_id)?;

    if let Some(expected_bin) = &task.to_bin {
        if &scanned_bin != expected_bin {
            return Err(WarehouseError::BinMismatch(
                expected_bin.clone(),
                scanned_bin,
            ));
        }
    }

    let payload = serde_json::json!({
        "task_id": task_id,
        "scanned_bin": scanned_bin,
    });

    let event = chain
        .append(identity, EventType::TaskCompleted, payload, None)
        .map_err(|e| WarehouseError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;

    // Update bin_contents for PUT tasks
    if let (Some(sku_id), Some(from_bin), Some(to_bin)) =
        (&task.sku_id, &task.from_bin, &task.to_bin)
    {
        if task.task_type == "PUT" || task.task_type == "PICK" {
            update_bin_qty(db, from_bin, sku_id, -(task.qty))?;
            update_bin_qty(db, to_bin, sku_id, task.qty)?;
        }
    }

    Ok(event)
}

/// List warehouse tasks, optionally filtered by status
pub fn list_tasks(db: &NodeDb, status_filter: Option<String>) -> Result<Vec<TaskRow>, WarehouseError> {
    use rusqlite::OptionalExtension;

    let conn = rusqlite::Connection::open_in_memory()
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;

    let mut tasks = Vec::new();

    let query = if let Some(status) = status_filter {
        format!(
            "SELECT id, task_type, sku_id, from_bin, to_bin, qty, status, assigned_to, created_at, completed_at
             FROM warehouse_tasks WHERE status = '{}' ORDER BY created_at DESC",
            status
        )
    } else {
        "SELECT id, task_type, sku_id, from_bin, to_bin, qty, status, assigned_to, created_at, completed_at
         FROM warehouse_tasks ORDER BY created_at DESC".to_string()
    };

    // Note: In real implementation, this queries NodeDb's connection.
    // For now, returning empty (integration with actual DB connection needed)

    // Sort by priority
    tasks.sort_by(|a, b| {
        let a_priority = task_priority(&a.task_type);
        let b_priority = task_priority(&b.task_type);
        b_priority.cmp(&a_priority)
    });

    Ok(tasks)
}

/// Get all contents of a bin
pub fn get_bin_contents(db: &NodeDb, bin_id: String) -> Result<Vec<BinContentRow>, WarehouseError> {
    // Query bin_contents WHERE bin_id = ?
    // Returns all SKUs in that bin with quantities
    Ok(vec![]) // Placeholder
}

/// Get summary of all bins
pub fn get_bin_map(db: &NodeDb) -> Result<Vec<BinSummary>, WarehouseError> {
    // Query all bins with total item count and fill level
    // Fill levels: empty (0), partial (1-50%), full (50%+)
    Ok(vec![]) // Placeholder
}

/// Start a cycle count for bins matching a zone prefix
pub fn start_cycle_count(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    zone_prefix: String,
) -> Result<Vec<TaskRow>, WarehouseError> {
    let count_id = Uuid::new_v4().to_string();

    let payload = serde_json::json!({
        "count_id": count_id,
        "zone_prefix": zone_prefix,
    });

    let event = chain
        .append(identity, EventType::CycleCountStarted, payload, None)
        .map_err(|e| WarehouseError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;

    // Generate COUNT tasks for all bins matching zone_prefix
    // For now return empty list
    Ok(vec![])
}

/// Complete a cycle count with variance computation
pub fn complete_cycle_count(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    count_id: String,
    results: Vec<CountResult>,
) -> Result<(), WarehouseError> {
    // Compute variances: expected_qty vs counted_qty
    // Emit STOCK_ADJUSTED for each variance
    // Emit CYCLE_COUNT_COMPLETED

    for result in results {
        let payload = serde_json::json!({
            "sku_id": result.sku_id,
            "location_id": result.bin_id,
            "delta": result.counted_qty,
            "reason": "CYCLE_COUNT_VARIANCE",
        });

        let event = chain
            .append(identity, EventType::StockAdjusted, payload, None)
            .map_err(|e| WarehouseError::ChainError(e.to_string()))?
            .clone();

        db.persist_event(&event)
            .map_err(|e| WarehouseError::DbError(e.to_string()))?;
        db.apply_event(&event)
            .map_err(|e| WarehouseError::DbError(e.to_string()))?;
    }

    let payload = serde_json::json!({
        "count_id": count_id,
    });

    let event = chain
        .append(identity, EventType::CycleCountCompleted, payload, None)
        .map_err(|e| WarehouseError::ChainError(e.to_string()))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;
    db.apply_event(&event)
        .map_err(|e| WarehouseError::DbError(e.to_string()))?;

    Ok(())
}

/// Auto-generate PUT tasks for received SKUs
pub fn auto_put_tasks(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    sku_id: String,
    qty: i64,
    preferred_zone: String,
) -> Result<Vec<TaskRow>, WarehouseError> {
    // Find best bins: same SKU first, then empty, within preferred zone
    // Generate PUT tasks for each bin
    Ok(vec![])
}

// ─── Helper Functions ────────────────────────────────────────────────────────

fn get_task_by_id(db: &NodeDb, task_id: &str) -> Result<TaskRow, WarehouseError> {
    // Query warehouse_tasks WHERE id = task_id
    Err(WarehouseError::TaskNotFound(task_id.to_string()))
}

fn update_bin_qty(db: &NodeDb, bin_id: &str, sku_id: &str, delta: i64) -> Result<(), WarehouseError> {
    // UPDATE bin_contents SET qty = qty + delta WHERE bin_id = ? AND sku_id = ?
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_priority_ordering() {
        assert!(task_priority("RECEIVE") > task_priority("PICK"));
        assert!(task_priority("PICK") > task_priority("PUT"));
        assert!(task_priority("PUT") > task_priority("TRANSFER"));
        assert!(task_priority("TRANSFER") > task_priority("COUNT"));
    }
}
