/// Quality Control Module
///
/// Implements ISO 2859-1 AQL sampling and defect tracking with dual-signed NCRs.

pub mod aql;

use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use uuid::Uuid;
use chrono::Utc;

use crate::dag::{SourceChain, ChainEvent, EventType, DagError};
use crate::identity::Identity;
use crate::db::DbError;
use aql::{AqlLevel, get_sample_plan};

// ─── Data Structures ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectionRow {
    pub id: String,
    pub po_id: Option<String>,
    pub supplier_did: String,
    pub status: String,                 // IN_PROGRESS | PASSED | FAILED
    pub aql_level: String,
    pub sample_size: i32,
    pub defects_found: i32,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemResult {
    pub id: String,
    pub batch_id: String,
    pub sku_id: Option<String>,
    pub result: String,                 // PASS | FAIL | CONDITIONAL
    pub defect_type: Option<String>,    // CRITICAL | MAJOR | MINOR
    pub notes: Option<String>,
    pub photo_hash: Option<String>,
    pub inspected_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchDetail {
    pub batch: InspectionRow,
    pub items: Vec<ItemResult>,
    pub defect_summary: DefectSummary,
    pub aql_verdict: String,            // ACCEPT | REJECT | INCONCLUSIVE
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefectSummary {
    pub critical_count: i32,
    pub major_count: i32,
    pub minor_count: i32,
    pub critical_pct: f64,
    pub major_pct: f64,
    pub minor_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierQuality {
    pub supplier_did: String,
    pub total_batches_inspected: i32,
    pub batches_passed: i32,
    pub batches_failed: i32,
    pub pass_rate_pct: f64,
    pub defect_rate_pct: f64,
    pub ncr_count: i32,
    pub quality_tier: char,             // A-F based on pass_rate_pct
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NcrRecord {
    pub id: String,
    pub event_id: String,
    pub batch_id: String,
    pub supplier_did: String,
    pub description: String,
    pub status: String,                 // RAISED | ACKNOWLEDGED | RESOLVED
    pub created_at: i64,
    pub resolved_at: Option<i64>,
}

// ─── Quality Control Service ─────────────────────────────────────────────────

pub fn start_inspection(
    db: &Connection,
    chain: &mut SourceChain,
    identity: &Identity,
    po_id: &str,
    supplier_did: &str,
    aql_level: &str,
    sample_size: i32,
) -> Result<ChainEvent, Box<dyn std::error::Error>> {
    let batch_id = Uuid::new_v4().to_string();

    // Validate AQL level
    let _sample_plan = get_sample_plan(sample_size as u32, parse_aql_level(aql_level))?;

    // Create event
    let payload = serde_json::json!({
        "batch_id": batch_id,
        "po_id": po_id,
        "supplier_did": supplier_did,
        "aql_level": aql_level,
        "sample_size": sample_size,
    });

    let event = chain.append(identity, EventType::InspectionStarted, payload, None)?;

    // Persist to DB
    db.execute(
        r#"INSERT OR IGNORE INTO inspection_batches
             (id, po_id, supplier_did, status, aql_level, sample_size, created_at)
           VALUES (?1, ?2, ?3, 'IN_PROGRESS', ?4, ?5, ?6)"#,
        params![batch_id, po_id, supplier_did, aql_level, sample_size, event.timestamp],
    )?;

    Ok(event.clone())
}

pub fn inspect_item(
    db: &Connection,
    chain: &mut SourceChain,
    identity: &Identity,
    batch_id: &str,
    sku_id: &str,
    result: &str,
    defect_type: Option<&str>,
    notes: Option<&str>,
    photo_hash: Option<&str>,
) -> Result<ChainEvent, Box<dyn std::error::Error>> {
    let item_id = Uuid::new_v4().to_string();

    // Create event
    let payload = serde_json::json!({
        "batch_id": batch_id,
        "item_id": item_id,
        "sku_id": sku_id,
        "result": result,
        "defect_type": defect_type,
        "notes": notes,
        "photo_hash": photo_hash,
    });

    let event = chain.append(identity, EventType::ItemInspected, payload, None)?;

    // Persist to DB
    db.execute(
        r#"INSERT OR IGNORE INTO inspection_items
             (id, batch_id, sku_id, result, defect_type, notes, photo_hash, inspected_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
        params![
            item_id, batch_id, sku_id, result, defect_type, notes, photo_hash, event.timestamp
        ],
    )?;

    Ok(event.clone())
}

pub fn complete_batch(
    db: &Connection,
    chain: &mut SourceChain,
    identity: &Identity,
    batch_id: &str,
) -> Result<ChainEvent, Box<dyn std::error::Error>> {
    // Get batch and items
    let batch_detail = get_batch_detail(db, batch_id)?;
    let defects = &batch_detail.defect_summary;

    // Get sample plan
    let batch = &batch_detail.batch;
    let aql_level = parse_aql_level(&batch.aql_level);
    let sample_plan = get_sample_plan(batch.sample_size as u32, aql_level)?;

    // Check against acceptance numbers
    let critical_fail = defects.critical_count > sample_plan.reject_critical;
    let major_fail = defects.major_count > sample_plan.reject_major;
    let minor_fail = defects.minor_count > sample_plan.reject_minor;

    let verdict = if critical_fail || major_fail || minor_fail {
        "REJECT"
    } else {
        "ACCEPT"
    };

    let event_type = match verdict {
        "ACCEPT" => EventType::BatchPassed,
        "REJECT" => EventType::BatchFailed,
        _ => EventType::BatchFailed,
    };

    let payload = serde_json::json!({
        "batch_id": batch_id,
        "verdict": verdict,
        "critical_count": defects.critical_count,
        "major_count": defects.major_count,
        "minor_count": defects.minor_count,
        "sample_size": batch.sample_size,
        "aql_level": batch.aql_level,
    });

    let event = chain.append(identity, event_type, payload, None)?;

    // Update batch in DB
    db.execute(
        r#"UPDATE inspection_batches SET status = ?1, result = ?2, completed_at = ?3
           WHERE id = ?4"#,
        params![
            if verdict == "ACCEPT" { "PASSED" } else { "FAILED" },
            verdict,
            event.timestamp,
            batch_id
        ],
    )?;

    Ok(event.clone())
}

pub fn raise_ncr(
    db: &Connection,
    chain: &mut SourceChain,
    identity: &Identity,
    batch_id: &str,
    description: &str,
) -> Result<ChainEvent, Box<dyn std::error::Error>> {
    let ncr_id = Uuid::new_v4().to_string();

    // Get batch to find supplier
    let batch = get_batch_detail(db, batch_id)?;
    let supplier_did = batch.batch.supplier_did;

    let payload = serde_json::json!({
        "ncr_id": ncr_id,
        "batch_id": batch_id,
        "supplier_did": supplier_did,
        "description": description,
    });

    let event = chain.append(identity, EventType::NcrRaised, payload, Some(supplier_did.clone()))?;

    // Persist to DB
    db.execute(
        r#"INSERT OR IGNORE INTO inspection_items
             (id, batch_id, sku_id, result, defect_type, notes, inspected_at)
           VALUES (?1, ?2, NULL, 'FAIL', 'NCR', ?3, ?4)"#,
        params![
            ncr_id,
            batch_id,
            format!("NCR: {}", description),
            event.timestamp
        ],
    )?;

    Ok(event.clone())
}

pub fn resolve_ncr(
    db: &Connection,
    chain: &mut SourceChain,
    identity: &Identity,
    ncr_event_id: &str,
    resolution: &str,
    supplier_sig: &str,
) -> Result<ChainEvent, Box<dyn std::error::Error>> {
    let payload = serde_json::json!({
        "ncr_event_id": ncr_event_id,
        "resolution": resolution,
    });

    let event = chain.append(identity, EventType::NcrResolved, payload, None)?;

    // Attach supplier signature
    chain.attach_counterparty_sig(&event.id, supplier_sig.to_string(), None)?;

    Ok(event.clone())
}

pub fn get_supplier_quality(
    db: &Connection,
    supplier_did: &str,
) -> Result<SupplierQuality, Box<dyn std::error::Error>> {
    let mut stmt = db.prepare(
        r#"SELECT COUNT(*) as total,
                  SUM(CASE WHEN result = 'ACCEPT' THEN 1 ELSE 0 END) as passed,
                  SUM(CASE WHEN result = 'REJECT' THEN 1 ELSE 0 END) as failed
           FROM inspection_batches
           WHERE supplier_did = ? AND completed_at IS NOT NULL"#,
    )?;

    let (total, passed, failed): (i32, i32, i32) = stmt.query_row(
        params![supplier_did],
        |row| {
            Ok((
                row.get(0).unwrap_or(0),
                row.get(1).unwrap_or(0),
                row.get(2).unwrap_or(0),
            ))
        },
    ).unwrap_or((0, 0, 0));

    let pass_rate_pct = if total > 0 {
        (passed as f64 / total as f64) * 100.0
    } else {
        0.0
    };

    // Get defect rate from items
    let mut stmt2 = db.prepare(
        r#"SELECT COUNT(*) as total,
                  SUM(CASE WHEN result = 'FAIL' THEN 1 ELSE 0 END) as failures
           FROM inspection_items ii
           JOIN inspection_batches ib ON ii.batch_id = ib.id
           WHERE ib.supplier_did = ? AND ib.completed_at IS NOT NULL"#,
    )?;

    let (item_total, failures): (i32, i32) = stmt2.query_row(
        params![supplier_did],
        |row| {
            Ok((
                row.get(0).unwrap_or(0),
                row.get(1).unwrap_or(0),
            ))
        },
    ).unwrap_or((0, 0));

    let defect_rate_pct = if item_total > 0 {
        (failures as f64 / item_total as f64) * 100.0
    } else {
        0.0
    };

    // Get NCR count
    let ncr_count: i32 = db.query_row(
        "SELECT COUNT(*) FROM inspection_items WHERE notes LIKE 'NCR:%'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    // Determine quality tier
    let quality_tier = match pass_rate_pct {
        x if x >= 95.0 => 'A',
        x if x >= 85.0 => 'B',
        x if x >= 70.0 => 'C',
        x if x >= 50.0 => 'D',
        _ => 'F',
    };

    Ok(SupplierQuality {
        supplier_did: supplier_did.to_string(),
        total_batches_inspected: total,
        batches_passed: passed,
        batches_failed: failed,
        pass_rate_pct,
        defect_rate_pct,
        ncr_count,
        quality_tier,
    })
}

pub fn list_inspections(
    db: &Connection,
    status: Option<&str>,
) -> Result<Vec<InspectionRow>, Box<dyn std::error::Error>> {
    let query = match status {
        Some(s) => format!(
            "SELECT id, po_id, supplier_did, status, aql_level, sample_size, \
                    defects_found, created_at, completed_at \
             FROM inspection_batches WHERE status = '{}' ORDER BY created_at DESC",
            s
        ),
        None => "SELECT id, po_id, supplier_did, status, aql_level, sample_size, \
                    defects_found, created_at, completed_at \
             FROM inspection_batches ORDER BY created_at DESC".to_string(),
    };

    let mut stmt = db.prepare(&query)?;
    let rows = stmt.query_map([], |row| {
        Ok(InspectionRow {
            id: row.get(0)?,
            po_id: row.get(1)?,
            supplier_did: row.get(2)?,
            status: row.get(3)?,
            aql_level: row.get(4)?,
            sample_size: row.get(5)?,
            defects_found: row.get(6)?,
            created_at: row.get(7)?,
            completed_at: row.get(8)?,
        })
    })?;

    let mut inspections = Vec::new();
    for row in rows {
        inspections.push(row?);
    }
    Ok(inspections)
}

pub fn get_batch_detail(
    db: &Connection,
    batch_id: &str,
) -> Result<BatchDetail, Box<dyn std::error::Error>> {
    // Get batch
    let batch: InspectionRow = db.query_row(
        "SELECT id, po_id, supplier_did, status, aql_level, sample_size, \
                defects_found, created_at, completed_at \
         FROM inspection_batches WHERE id = ?",
        params![batch_id],
        |row| {
            Ok(InspectionRow {
                id: row.get(0)?,
                po_id: row.get(1)?,
                supplier_did: row.get(2)?,
                status: row.get(3)?,
                aql_level: row.get(4)?,
                sample_size: row.get(5)?,
                defects_found: row.get(6)?,
                created_at: row.get(7)?,
                completed_at: row.get(8)?,
            })
        },
    )?;

    // Get items
    let mut stmt = db.prepare(
        "SELECT id, batch_id, sku_id, result, defect_type, notes, photo_hash, inspected_at \
         FROM inspection_items WHERE batch_id = ? ORDER BY inspected_at ASC",
    )?;

    let items_iter = stmt.query_map(params![batch_id], |row| {
        Ok(ItemResult {
            id: row.get(0)?,
            batch_id: row.get(1)?,
            sku_id: row.get(2)?,
            result: row.get(3)?,
            defect_type: row.get(4)?,
            notes: row.get(5)?,
            photo_hash: row.get(6)?,
            inspected_at: row.get(7)?,
        })
    })?;

    let mut items = Vec::new();
    for item in items_iter {
        items.push(item?);
    }

    // Count defects by severity
    let critical_count = items.iter()
        .filter(|i| i.defect_type.as_deref() == Some("CRITICAL"))
        .count() as i32;
    let major_count = items.iter()
        .filter(|i| i.defect_type.as_deref() == Some("MAJOR"))
        .count() as i32;
    let minor_count = items.iter()
        .filter(|i| i.defect_type.as_deref() == Some("MINOR"))
        .count() as i32;

    let total_defects = critical_count + major_count + minor_count;
    let item_count = items.len() as i32;

    let defect_summary = DefectSummary {
        critical_count,
        major_count,
        minor_count,
        critical_pct: if item_count > 0 { (critical_count as f64 / item_count as f64) * 100.0 } else { 0.0 },
        major_pct: if item_count > 0 { (major_count as f64 / item_count as f64) * 100.0 } else { 0.0 },
        minor_pct: if item_count > 0 { (minor_count as f64 / item_count as f64) * 100.0 } else { 0.0 },
    };

    // Determine AQL verdict
    let aql_level = parse_aql_level(&batch.aql_level);
    let sample_plan = get_sample_plan(batch.sample_size as u32, aql_level)?;

    let aql_verdict = if critical_count > sample_plan.reject_critical
        || major_count > sample_plan.reject_major
        || minor_count > sample_plan.reject_minor
    {
        "REJECT".to_string()
    } else if critical_count <= sample_plan.accept_critical
        && major_count <= sample_plan.accept_major
        && minor_count <= sample_plan.accept_minor
    {
        "ACCEPT".to_string()
    } else {
        "INCONCLUSIVE".to_string()
    };

    Ok(BatchDetail {
        batch,
        items,
        defect_summary,
        aql_verdict,
    })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn parse_aql_level(level_str: &str) -> AqlLevel {
    match level_str.to_uppercase().as_str() {
        "TIGHTENED" => AqlLevel::Tightened,
        "REDUCED" => AqlLevel::Reduced,
        _ => AqlLevel::Normal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;
    use crate::dag::SourceChain;
    use crate::db::NodeDb;

    #[test]
    fn test_start_inspection() {
        let db = NodeDb::open_in_memory().unwrap();
        let conn = db.get_connection();
        let id = Identity::generate().unwrap();
        let mut chain = SourceChain::genesis(&id).unwrap();

        let event = start_inspection(
            conn,
            &mut chain,
            &id,
            "PO-001",
            "did:key:supplier",
            "NORMAL",
            125,
        ).unwrap();

        assert_eq!(event.event_type, EventType::InspectionStarted);
    }
}
