//! Procurement module — Purchase Order lifecycle and Supplier Relationship Management.
//!
//! Responsibilities:
//! 1. **PO Lifecycle** — create, confirm, ship, receive, cancel
//! 2. **Dual-signed cross-node events** — PO_ISSUED, PO_CONFIRMED, SHIPMENT_SENT, SHIPMENT_RECEIVED
//! 3. **Line item tracking** — qty ordered vs qty received per SKU
//! 4. **Supplier Scorecards** — on-time %, fill rate %, quality tier (A/B/C/D/F)
//!
//! Flow:
//!   1. Buyer creates PO → emit PO_ISSUED (counterparty=supplier_did)
//!   2. Supplier receives, signs → emit PO_CONFIRMED on buyer's chain
//!   3. Supplier ships → emit SHIPMENT_SENT
//!   4. Buyer receives → emit SHIPMENT_RECEIVED + STOCK_RECEIVED per line item

pub mod messages;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use chrono::Utc;

use crate::db::NodeDb;
use crate::dag::{SourceChain, ChainEvent, EventType};
use crate::identity::Identity;

#[derive(Debug, Error)]
pub enum ProcurementError {
    #[error("database error: {0}")]
    Db(String),
    #[error("chain error: {0}")]
    Chain(String),
    #[error("po not found: {0}")]
    PoNotFound(String),
    #[error("invalid po status for operation: {0}")]
    InvalidStatus(String),
    #[error("line item qty mismatch: {0}")]
    QtyMismatch(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
}

// ─── Input/Output Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineItemInput {
    pub sku_id: String,
    pub qty: i64,
    pub unit_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePoInput {
    pub supplier_did: String,
    pub line_items: Vec<LineItemInput>,
    pub expected_delivery: Option<i64>,
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceivedItem {
    pub sku_id: String,
    pub qty_received: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseOrder {
    pub id: String,
    pub supplier_did: String,
    pub status: String,
    pub total_value: f64,
    pub currency: String,
    pub expected_delivery: Option<i64>,
    pub confirmed_at: Option<i64>,
    pub shipped_at: Option<i64>,
    pub received_at: Option<i64>,
    pub created_at: i64,
    /// ed25519 signature from the buyer
    pub our_sig: Option<String>,
    /// ed25519 signature from the supplier (for CONFIRMED status)
    pub their_sig: Option<String>,
    /// DHT anchor (for CONFIRMED status)
    pub dht_anchor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoLineItem {
    pub id: String,
    pub po_id: String,
    pub sku_id: String,
    pub qty_ordered: i64,
    pub unit_price: f64,
    pub qty_received: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoDetail {
    pub po: PurchaseOrder,
    pub line_items: Vec<PoLineItem>,
    /// Status transitions from chain events in chronological order
    pub status_timeline: Vec<StatusTransition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusTransition {
    pub event_id: String,
    pub event_type: String,
    pub status: String,
    pub timestamp: i64,
    pub is_dual_signed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierScorecard {
    pub supplier_did: String,
    pub po_count: i64,
    pub on_time_pct: f64,
    pub fill_rate_pct: f64,
    pub avg_lead_days: f64,
    pub quality_tier: char, // A, B, C, D, F
}

// ─── Service Functions ───────────────────────────────────────────────────────

/// Create a Purchase Order.
///
/// 1. Generate PO ID
/// 2. Compute total from line items
/// 3. Append PO_ISSUED event (counterparty=supplier_did)
/// 4. Persist event + apply projection (insert purchase_orders + po_line_items)
pub fn create_po(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    input: CreatePoInput,
) -> Result<PurchaseOrder, ProcurementError> {
    // Validate
    if input.line_items.is_empty() {
        return Err(ProcurementError::InvalidInput(
            "PO must have at least one line item".to_string(),
        ));
    }

    let po_id = Uuid::new_v4().to_string();
    let total_value: f64 = input
        .line_items
        .iter()
        .map(|li| (li.qty as f64) * li.unit_price)
        .sum();

    let currency = input.currency.unwrap_or_else(|| "USD".to_string());

    // Build payload
    let payload = serde_json::json!({
        "po_id": &po_id,
        "to_did": &input.supplier_did,
        "total_value": total_value,
        "currency": &currency,
        "expected_delivery": input.expected_delivery,
        "line_items": input.line_items.iter().map(|li| serde_json::json!({
            "sku_id": &li.sku_id,
            "qty": li.qty,
            "unit_price": li.unit_price,
        })).collect::<Vec<_>>(),
    });

    // Append to chain (counterparty = supplier)
    let event = chain
        .append(
            identity,
            EventType::PoIssued,
            payload,
            Some(input.supplier_did.clone()),
        )
        .map_err(|e| ProcurementError::Chain(format!("{:?}", e)))?
        .clone();

    // Persist event
    db.persist_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    // Apply projection
    db.apply_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    // Insert line items
    for li in &input.line_items {
        insert_po_line_item(db, &po_id, li)
            .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;
    }

    Ok(PurchaseOrder {
        id: po_id,
        supplier_did: input.supplier_did,
        status: "ISSUED".to_string(),
        total_value,
        currency,
        expected_delivery: input.expected_delivery,
        confirmed_at: None,
        shipped_at: None,
        received_at: None,
        created_at: Utc::now().timestamp_millis(),
        our_sig: Some(event.signature.clone()),
        their_sig: None,
        dht_anchor: None,
    })
}

/// Attach supplier's signature to a PO_ISSUED event, emit PO_CONFIRMED.
///
/// 1. Find the PO_ISSUED event by po_id
/// 2. Attach counterparty signature (via chain.attach_counterparty_sig)
/// 3. Update purchase_orders status = CONFIRMED
pub fn confirm_po(
    db: &NodeDb,
    chain: &mut SourceChain,
    po_id: &str,
    supplier_sig: String,
) -> Result<(), ProcurementError> {
    // Find PO in DB
    let po = get_po_by_id(db, po_id)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?
        .ok_or(ProcurementError::PoNotFound(po_id.to_string()))?;

    if po.status != "ISSUED" {
        return Err(ProcurementError::InvalidStatus(format!(
            "cannot confirm PO with status: {}",
            po.status
        )));
    }

    // Find the PO_ISSUED event in the chain
    let po_issued_event = chain
        .events()
        .iter()
        .find(|e| {
            e.event_type == EventType::PoIssued
                && e.payload["po_id"].as_str() == Some(po_id)
        })
        .cloned()
        .ok_or(ProcurementError::PoNotFound(
            "PO_ISSUED event not found in chain".to_string(),
        ))?;

    // Attach the supplier's signature
    chain
        .attach_counterparty_sig(&po_issued_event.id, supplier_sig, None)
        .map_err(|e| ProcurementError::Chain(format!("{:?}", e)))?;

    // Update projection
    update_po_status(db, po_id, "CONFIRMED", Some(Utc::now().timestamp_millis()))
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    Ok(())
}

/// Cancel a Purchase Order (only if status < SHIPPED).
pub fn cancel_po(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    po_id: &str,
) -> Result<(), ProcurementError> {
    let po = get_po_by_id(db, po_id)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?
        .ok_or(ProcurementError::PoNotFound(po_id.to_string()))?;

    // Only allow cancellation before shipment
    let allowed_statuses = ["ISSUED", "CONFIRMED"];
    if !allowed_statuses.contains(&po.status.as_str()) {
        return Err(ProcurementError::InvalidStatus(
            "cannot cancel PO after shipment".to_string(),
        ));
    }

    let payload = serde_json::json!({"po_id": po_id});

    let event = chain
        .append(
            identity,
            EventType::PoCancelled,
            payload,
            Some(po.supplier_did.clone()),
        )
        .map_err(|e| ProcurementError::Chain(format!("{:?}", e)))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    db.apply_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    update_po_status(db, po_id, "CANCELLED", Some(Utc::now().timestamp_millis()))
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    Ok(())
}

/// Record shipment sent — emit SHIPMENT_SENT event.
pub fn record_shipment(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    po_id: &str,
    tracking: String,
) -> Result<(), ProcurementError> {
    let po = get_po_by_id(db, po_id)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?
        .ok_or(ProcurementError::PoNotFound(po_id.to_string()))?;

    if po.status != "CONFIRMED" {
        return Err(ProcurementError::InvalidStatus(
            "can only ship confirmed POs".to_string(),
        ));
    }

    let payload = serde_json::json!({
        "po_id": po_id,
        "tracking": tracking,
    });

    let event = chain
        .append(
            identity,
            EventType::ShipmentSent,
            payload,
            Some(po.supplier_did.clone()),
        )
        .map_err(|e| ProcurementError::Chain(format!("{:?}", e)))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    db.apply_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    update_po_status(db, po_id, "SHIPPED", Some(Utc::now().timestamp_millis()))
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    Ok(())
}

/// Receive shipment — emit SHIPMENT_RECEIVED + STOCK_RECEIVED per line item.
///
/// For each received item:
///   - Emit STOCK_RECEIVED event for each sku
///   - Update po_line_items.qty_received
pub fn receive_shipment(
    db: &NodeDb,
    chain: &mut SourceChain,
    identity: &Identity,
    po_id: &str,
    received_items: Vec<ReceivedItem>,
) -> Result<(), ProcurementError> {
    let po = get_po_by_id(db, po_id)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?
        .ok_or(ProcurementError::PoNotFound(po_id.to_string()))?;

    if po.status != "SHIPPED" {
        return Err(ProcurementError::InvalidStatus(
            "can only receive shipped POs".to_string(),
        ));
    }

    // Emit SHIPMENT_RECEIVED
    let payload = serde_json::json!({
        "po_id": po_id,
        "received_items": received_items.iter().map(|ri| serde_json::json!({
            "sku_id": &ri.sku_id,
            "qty_received": ri.qty_received,
        })).collect::<Vec<_>>(),
    });

    let event = chain
        .append(
            identity,
            EventType::ShipmentReceived,
            payload,
            Some(po.supplier_did.clone()),
        )
        .map_err(|e| ProcurementError::Chain(format!("{:?}", e)))?
        .clone();

    db.persist_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    db.apply_event(&event)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    // Emit STOCK_RECEIVED for each item + update line items
    for item in received_items {
        let stock_payload = serde_json::json!({
            "sku_id": &item.sku_id,
            "po_id": po_id,
            "qty": item.qty_received,
            "location_id": "WAREHOUSE",
        });

        let stock_event = chain
            .append(identity, EventType::StockReceived, stock_payload, None)
            .map_err(|e| ProcurementError::Chain(format!("{:?}", e)))?
            .clone();

        db.persist_event(&stock_event)
            .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

        db.apply_event(&stock_event)
            .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

        // Update line item qty_received
        update_line_item_qty_received(db, po_id, &item.sku_id, item.qty_received)
            .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;
    }

    update_po_status(db, po_id, "RECEIVED", Some(Utc::now().timestamp_millis()))
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    Ok(())
}

/// List all purchase orders, optionally filtered by status.
pub fn list_pos(
    db: &NodeDb,
    status_filter: Option<String>,
) -> Result<Vec<PurchaseOrder>, ProcurementError> {
    list_pos_from_db(db, status_filter).map_err(|e| ProcurementError::Db(format!("{:?}", e)))
}

/// Get full PO detail: PO header + line items + status transitions.
pub fn get_po_detail(db: &NodeDb, po_id: &str) -> Result<Option<PoDetail>, ProcurementError> {
    let po = get_po_by_id(db, po_id)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    let Some(po) = po else {
        return Ok(None);
    };

    let line_items = get_po_line_items(db, po_id)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    let status_timeline = get_po_status_timeline(db, po_id)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))?;

    Ok(Some(PoDetail {
        po,
        line_items,
        status_timeline,
    }))
}

/// Get supplier scorecard: on-time %, fill rate %, quality tier.
///
/// Calculations:
///   - on_time_pct: (received_on_time / received_total) * 100
///   - fill_rate_pct: (total_qty_received / total_qty_ordered) * 100
///   - avg_lead_days: avg(received_at - expected_delivery)
///   - quality_tier: composite of on_time + fill_rate:
///     - A: on_time >= 95% AND fill_rate >= 98%
///     - B: on_time >= 90% AND fill_rate >= 95%
///     - C: on_time >= 85% OR fill_rate >= 90%
///     - D: on_time >= 70% OR fill_rate >= 70%
///     - F: otherwise
pub fn get_supplier_scorecard(
    db: &NodeDb,
    supplier_did: &str,
) -> Result<SupplierScorecard, ProcurementError> {
    compute_supplier_scorecard(db, supplier_did)
        .map_err(|e| ProcurementError::Db(format!("{:?}", e)))
}

// ─── Private DB Helpers ──────────────────────────────────────────────────────

use rusqlite::params;

fn get_po_by_id(db: &NodeDb, po_id: &str) -> Result<Option<PurchaseOrder>, crate::db::DbError> {
    db.query_row_opt(
        "SELECT id, supplier_did, status, total_value, currency, expected_delivery,
                confirmed_at, shipped_at, received_at, created_at, our_sig, their_sig, dht_anchor
         FROM purchase_orders WHERE id = ?1",
        params![po_id],
        |row| {
            Ok(PurchaseOrder {
                id: row.get(0)?,
                supplier_did: row.get(1)?,
                status: row.get(2)?,
                total_value: row.get(3)?,
                currency: row.get(4)?,
                expected_delivery: row.get(5)?,
                confirmed_at: row.get(6)?,
                shipped_at: row.get(7)?,
                received_at: row.get(8)?,
                created_at: row.get(9)?,
                our_sig: row.get(10)?,
                their_sig: row.get(11)?,
                dht_anchor: row.get(12)?,
            })
        },
    )
}

fn list_pos_from_db(
    db: &NodeDb,
    status_filter: Option<String>,
) -> Result<Vec<PurchaseOrder>, crate::db::DbError> {
    let query = if let Some(status) = status_filter {
        format!(
            "SELECT id, supplier_did, status, total_value, currency, expected_delivery,
                    confirmed_at, shipped_at, received_at, created_at, our_sig, their_sig, dht_anchor
             FROM purchase_orders WHERE status = '{}' ORDER BY created_at DESC",
            status
        )
    } else {
        "SELECT id, supplier_did, status, total_value, currency, expected_delivery,
                confirmed_at, shipped_at, received_at, created_at, our_sig, their_sig, dht_anchor
         FROM purchase_orders ORDER BY created_at DESC"
            .to_string()
    };

    db.query_rows(&query, |row| {
        Ok(PurchaseOrder {
            id: row.get(0)?,
            supplier_did: row.get(1)?,
            status: row.get(2)?,
            total_value: row.get(3)?,
            currency: row.get(4)?,
            expected_delivery: row.get(5)?,
            confirmed_at: row.get(6)?,
            shipped_at: row.get(7)?,
            received_at: row.get(8)?,
            created_at: row.get(9)?,
            our_sig: row.get(10)?,
            their_sig: row.get(11)?,
            dht_anchor: row.get(12)?,
        })
    })
}

fn get_po_line_items(db: &NodeDb, po_id: &str) -> Result<Vec<PoLineItem>, crate::db::DbError> {
    db.query_rows(
        &format!("SELECT id, po_id, sku_id, qty_ordered, unit_price, qty_received FROM po_line_items WHERE po_id = '{}'", po_id),
        |row| {
            Ok(PoLineItem {
                id: row.get(0)?,
                po_id: row.get(1)?,
                sku_id: row.get(2)?,
                qty_ordered: row.get(3)?,
                unit_price: row.get(4)?,
                qty_received: row.get(5)?,
            })
        },
    )
}

fn insert_po_line_item(
    db: &NodeDb,
    po_id: &str,
    item: &LineItemInput,
) -> Result<(), crate::db::DbError> {
    db.execute_insert(
        "INSERT INTO po_line_items (id, po_id, sku_id, qty_ordered, unit_price, qty_received)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        params![
            Uuid::new_v4().to_string(),
            po_id,
            item.sku_id,
            item.qty,
            item.unit_price
        ],
    )
}

fn update_po_status(
    db: &NodeDb,
    po_id: &str,
    status: &str,
    timestamp: Option<i64>,
) -> Result<(), crate::db::DbError> {
    let col = match status {
        "CONFIRMED" => "confirmed_at",
        "SHIPPED" => "shipped_at",
        "RECEIVED" => "received_at",
        _ => "created_at",
    };

    db.execute_update(
        &format!(
            "UPDATE purchase_orders SET status = '{}', {} = ? WHERE id = ?",
            status, col
        ),
        params![timestamp, po_id],
    )
}

fn update_line_item_qty_received(
    db: &NodeDb,
    po_id: &str,
    sku_id: &str,
    qty: i64,
) -> Result<(), crate::db::DbError> {
    db.execute_update(
        "UPDATE po_line_items SET qty_received = qty_received + ? WHERE po_id = ? AND sku_id = ?",
        params![qty, po_id, sku_id],
    )
}

fn get_po_status_timeline(
    db: &NodeDb,
    po_id: &str,
) -> Result<Vec<StatusTransition>, crate::db::DbError> {
    db.query_rows(
        &format!(
            r#"SELECT id, event_type, timestamp, CASE
                 WHEN event_type = 'PO_ISSUED' THEN 'ISSUED'
                 WHEN event_type = 'PO_CONFIRMED' THEN 'CONFIRMED'
                 WHEN event_type = 'SHIPMENT_SENT' THEN 'SHIPPED'
                 WHEN event_type = 'SHIPMENT_RECEIVED' THEN 'RECEIVED'
                 WHEN event_type = 'PO_CANCELLED' THEN 'CANCELLED'
                 ELSE 'UNKNOWN'
               END as status,
               CASE WHEN their_sig IS NOT NULL THEN 1 ELSE 0 END as is_dual_signed
            FROM source_chain
            WHERE json_extract(payload, '$.po_id') = '{}' OR json_extract(payload, '$.po_id') = '{}'
            ORDER BY timestamp ASC"#,
            po_id, po_id
        ),
        |row| {
            Ok(StatusTransition {
                event_id: row.get(0)?,
                event_type: row.get(1)?,
                status: row.get(2)?,
                timestamp: row.get(3)?,
                is_dual_signed: row.get::<_, i64>(4)? != 0,
            })
        },
    )
}

fn compute_supplier_scorecard(
    db: &NodeDb,
    supplier_did: &str,
) -> Result<SupplierScorecard, crate::db::DbError> {
    // Count POs
    let po_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM purchase_orders WHERE supplier_did = ? AND status = 'RECEIVED'",
        params![supplier_did],
        |row| row.get(0),
    )?;

    if po_count == 0 {
        return Ok(SupplierScorecard {
            supplier_did: supplier_did.to_string(),
            po_count: 0,
            on_time_pct: 0.0,
            fill_rate_pct: 0.0,
            avg_lead_days: 0.0,
            quality_tier: 'F',
        });
    }

    // On-time percentage: (received_at <= expected_delivery) / total_received
    let on_time_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM purchase_orders
         WHERE supplier_did = ? AND status = 'RECEIVED'
         AND (expected_delivery IS NULL OR received_at <= expected_delivery)",
        params![supplier_did],
        |row| row.get(0),
    )?;
    let on_time_pct = if po_count > 0 {
        (on_time_count as f64 / po_count as f64) * 100.0
    } else {
        0.0
    };

    // Fill rate: total_qty_received / total_qty_ordered
    let (total_ordered, total_received): (i64, i64) = db.query_row(
        "SELECT COALESCE(SUM(qty_ordered), 0), COALESCE(SUM(qty_received), 0)
         FROM po_line_items pli
         INNER JOIN purchase_orders po ON pli.po_id = po.id
         WHERE po.supplier_did = ? AND po.status = 'RECEIVED'",
        params![supplier_did],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let fill_rate_pct = if total_ordered > 0 {
        (total_received as f64 / total_ordered as f64) * 100.0
    } else {
        0.0
    };

    // Average lead days
    let avg_lead_days: f64 = db.query_row(
        "SELECT AVG(CAST(received_at - expected_delivery AS REAL) / (1000 * 60 * 60 * 24))
         FROM purchase_orders
         WHERE supplier_did = ? AND status = 'RECEIVED' AND expected_delivery IS NOT NULL",
        params![supplier_did],
        |row| row.get(0).unwrap_or(0.0),
    )?;

    // Quality tier calculation
    let quality_tier = match (on_time_pct, fill_rate_pct) {
        (ot, fr) if ot >= 95.0 && fr >= 98.0 => 'A',
        (ot, fr) if ot >= 90.0 && fr >= 95.0 => 'B',
        (ot, fr) if ot >= 85.0 || fr >= 90.0 => 'C',
        (ot, fr) if ot >= 70.0 || fr >= 70.0 => 'D',
        _ => 'F',
    };

    Ok(SupplierScorecard {
        supplier_did: supplier_did.to_string(),
        po_count,
        on_time_pct,
        fill_rate_pct,
        avg_lead_days,
        quality_tier,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;
    use crate::db::NodeDb;

    #[test]
    fn test_create_and_list_po() {
        let db = NodeDb::open_in_memory().unwrap();
        let id = Identity::generate().unwrap();
        let mut chain = crate::dag::SourceChain::genesis(&id).unwrap();

        let input = CreatePoInput {
            supplier_did: "did:scn:supplier123".to_string(),
            line_items: vec![
                LineItemInput {
                    sku_id: "SKU-001".to_string(),
                    qty: 100,
                    unit_price: 10.0,
                },
                LineItemInput {
                    sku_id: "SKU-002".to_string(),
                    qty: 50,
                    unit_price: 20.0,
                },
            ],
            expected_delivery: Some(Utc::now().timestamp_millis() + 86400000),
            currency: Some("USD".to_string()),
        };

        let po = create_po(&db, &mut chain, &id, input).unwrap();
        assert_eq!(po.status, "ISSUED");
        assert_eq!(po.total_value, 1000.0 + 1000.0); // 100*10 + 50*20

        let pos = list_pos(&db, None).unwrap();
        assert_eq!(pos.len(), 1);
    }
}
