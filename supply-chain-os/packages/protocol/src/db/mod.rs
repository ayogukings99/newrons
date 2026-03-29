/// SQLite database module — schema init and event projection engine.
///
/// The SQLite database is a *projected read model* of the source chain.
/// Every table can be wiped and rebuilt by replaying all events in order.
///
/// Two categories of tables:
///   A. SOURCE CHAIN — `source_chain` (append-only, mirrors the DAG log)
///   B. PROJECTED STATE — all other tables (fast read model)
///
/// The projection engine (`NodeDb::apply_event`) maps each EventType to
/// the SQL mutations that update the projected state.

use rusqlite::{Connection, Result as RusqliteResult, params};
use thiserror::Error;
use crate::dag::{ChainEvent, EventType};

#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("projection error for event {0}: {1}")]
    Projection(String, String),
}

pub struct NodeDb {
    conn: Connection,
}

impl NodeDb {
    /// Open (or create) the node database at the given path.
    pub fn open(path: &str) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    /// Open an in-memory database (for tests).
    pub fn open_in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    /// Get reference to the underlying SQLite connection for direct queries.
    pub fn get_connection(&self) -> &Connection {
        &self.conn
    }

    // ─── Schema Init ─────────────────────────────────────────────────────────

    fn init_schema(&self) -> Result<(), DbError> {
        self.conn.execute_batch(SCHEMA_SQL)?;
        Ok(())
    }

    // ─── Source Chain Persistence ────────────────────────────────────────────

    /// Persist a ChainEvent to the source_chain table.
    pub fn persist_event(&self, event: &ChainEvent) -> Result<(), DbError> {
        self.conn.execute(
            r#"
            INSERT OR IGNORE INTO source_chain
              (id, version, event_type, author, prev_hash, payload, signature,
               timestamp, counterparty, their_sig, dht_anchor)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                event.id,
                event.version,
                serde_json::to_string(&event.event_type)?,
                event.author,
                event.prev_hash,
                serde_json::to_string(&event.payload)?,
                event.signature,
                event.timestamp,
                event.counterparty,
                event.their_sig,
                event.dht_anchor,
            ],
        )?;
        Ok(())
    }

    /// Load all events in chain order (ascending by rowid).
    pub fn load_all_events(&self) -> Result<Vec<serde_json::Value>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, version, event_type, author, prev_hash, payload, signature,
                    timestamp, counterparty, their_sig, dht_anchor
             FROM source_chain ORDER BY rowid ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id":           row.get::<_, String>(0)?,
                "version":      row.get::<_, String>(1)?,
                "event_type":   row.get::<_, String>(2)?,
                "author":       row.get::<_, String>(3)?,
                "prev_hash":    row.get::<_, String>(4)?,
                "payload":      row.get::<_, String>(5)?,
                "signature":    row.get::<_, String>(6)?,
                "timestamp":    row.get::<_, i64>(7)?,
                "counterparty": row.get::<_, Option<String>>(8)?,
                "their_sig":    row.get::<_, Option<String>>(9)?,
                "dht_anchor":   row.get::<_, Option<String>>(10)?,
            }))
        })?;

        let mut events = Vec::new();
        for row in rows {
            events.push(row?);
        }
        Ok(events)
    }

    // ─── Generic Query Helpers ───────────────────────────────────────────────

    /// Execute a query that returns a single row, mapping with a closure.
    pub fn query_row<F, T>(&self, sql: &str, params: rusqlite::params::Params, f: F) -> Result<T, DbError>
    where
        F: FnOnce(&rusqlite::Row) -> RusqliteResult<T>,
    {
        let mut stmt = self.conn.prepare(sql)?;
        let result = stmt.query_row(params, f)?;
        Ok(result)
    }

    /// Execute a query that returns multiple rows, mapping with a closure.
    pub fn query_rows<F, T>(&self, sql: &str, f: F) -> Result<Vec<T>, DbError>
    where
        F: Fn(&rusqlite::Row) -> RusqliteResult<T>,
    {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map([], f)?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Execute a query that may return one row.
    pub fn query_row_opt<F, T>(&self, sql: &str, params: rusqlite::params::Params, f: F) -> Result<Option<T>, DbError>
    where
        F: FnOnce(&rusqlite::Row) -> RusqliteResult<T>,
    {
        let mut stmt = self.conn.prepare(sql)?;
        match stmt.query_row(params, f) {
            Ok(result) => Ok(Some(result)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }

    /// Execute an INSERT statement.
    pub fn execute_insert(&self, sql: &str, params: rusqlite::params::Params) -> Result<(), DbError> {
        self.conn.execute(sql, params)?;
        Ok(())
    }

    /// Execute an UPDATE statement.
    pub fn execute_update(&self, sql: &str, params: rusqlite::params::Params) -> Result<(), DbError> {
        self.conn.execute(sql, params)?;
        Ok(())
    }

    // ─── Projection Engine ───────────────────────────────────────────────────

    /// Apply an event to the projected state (the read model).
    ///
    /// This is called after every `persist_event` call and also during
    /// chain replay (rebuild from scratch).
    pub fn apply_event(&self, event: &ChainEvent) -> Result<(), DbError> {
        let p = &event.payload;
        match &event.event_type {
            EventType::Genesis => {
                // Upsert node identity into the `nodes` table
                self.conn.execute(
                    r#"INSERT OR REPLACE INTO nodes (did, display_name, created_at)
                       VALUES (?1, ?2, ?3)"#,
                    params![
                        p["did"].as_str().unwrap_or(""),
                        p.get("display_name").and_then(|v| v.as_str()),
                        event.timestamp,
                    ],
                )?;
            }
            EventType::SkuCreated => {
                self.conn.execute(
                    r#"INSERT OR IGNORE INTO skus
                         (id, name, description, unit_of_measure, reorder_point,
                          economic_order_qty, safety_stock, created_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
                    params![
                        p["id"].as_str().unwrap_or(""),
                        p["name"].as_str().unwrap_or(""),
                        p.get("description").and_then(|v| v.as_str()),
                        p.get("unit_of_measure").and_then(|v| v.as_str()).unwrap_or("EACH"),
                        p.get("reorder_point").and_then(|v| v.as_i64()).unwrap_or(0),
                        p.get("economic_order_qty").and_then(|v| v.as_i64()).unwrap_or(0),
                        p.get("safety_stock").and_then(|v| v.as_i64()).unwrap_or(0),
                        event.timestamp,
                    ],
                )?;
            }
            EventType::StockReceived => {
                let sku_id = p["sku_id"].as_str().unwrap_or("");
                let location_id = p["location_id"].as_str().unwrap_or("");
                let qty = p["qty"].as_i64().unwrap_or(0);
                // Upsert stock_levels
                self.conn.execute(
                    r#"INSERT INTO stock_levels (sku_id, location_id, qty_on_hand, updated_at)
                       VALUES (?1, ?2, ?3, ?4)
                       ON CONFLICT (sku_id, location_id) DO UPDATE SET
                         qty_on_hand = qty_on_hand + excluded.qty_on_hand,
                         updated_at  = excluded.updated_at"#,
                    params![sku_id, location_id, qty, event.timestamp],
                )?;
                // Append to stock_events
                self.conn.execute(
                    r#"INSERT INTO stock_events
                         (id, event_chain_id, sku_id, location_id, delta, reason, recorded_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, 'RECEIVED', ?6)"#,
                    params![
                        uuid::Uuid::new_v4().to_string(),
                        event.id,
                        sku_id, location_id, qty, event.timestamp
                    ],
                )?;
            }
            EventType::StockAdjusted => {
                let sku_id = p["sku_id"].as_str().unwrap_or("");
                let location_id = p["location_id"].as_str().unwrap_or("");
                let delta = p["delta"].as_i64().unwrap_or(0);
                let reason = p.get("reason").and_then(|v| v.as_str()).unwrap_or("MANUAL");
                self.conn.execute(
                    r#"UPDATE stock_levels SET
                         qty_on_hand = qty_on_hand + ?1,
                         updated_at  = ?2
                       WHERE sku_id = ?3 AND location_id = ?4"#,
                    params![delta, event.timestamp, sku_id, location_id],
                )?;
                self.conn.execute(
                    r#"INSERT INTO stock_events
                         (id, event_chain_id, sku_id, location_id, delta, reason, recorded_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
                    params![
                        uuid::Uuid::new_v4().to_string(),
                        event.id, sku_id, location_id, delta, reason, event.timestamp
                    ],
                )?;
            }
            EventType::PoIssued => {
                self.conn.execute(
                    r#"INSERT OR IGNORE INTO purchase_orders
                         (id, supplier_did, status, total_value, currency,
                          expected_delivery, created_at)
                       VALUES (?1, ?2, 'ISSUED', ?3, ?4, ?5, ?6)"#,
                    params![
                        p["po_id"].as_str().unwrap_or(""),
                        p["to_did"].as_str().unwrap_or(""),
                        p.get("total_value").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        p.get("currency").and_then(|v| v.as_str()).unwrap_or("USD"),
                        p.get("expected_delivery").and_then(|v| v.as_i64()),
                        event.timestamp,
                    ],
                )?;
            }
            EventType::PoConfirmed => {
                self.conn.execute(
                    r#"UPDATE purchase_orders SET status = 'CONFIRMED', confirmed_at = ?1
                       WHERE id = ?2"#,
                    params![event.timestamp, p["po_id"].as_str().unwrap_or("")],
                )?;
            }
            EventType::DeliveryConfirmed => {
                self.conn.execute(
                    r#"UPDATE delivery_routes SET status = 'COMPLETED', completed_at = ?1
                       WHERE id = ?2"#,
                    params![event.timestamp, p["route_id"].as_str().unwrap_or("")],
                )?;
            }
            EventType::TaskCreated => {
                self.conn.execute(
                    r#"INSERT OR IGNORE INTO warehouse_tasks
                         (id, task_type, sku_id, from_bin, to_bin, qty, status, created_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PENDING', ?7)"#,
                    params![
                        p["task_id"].as_str().unwrap_or(""),
                        p.get("task_type").and_then(|v| v.as_str()).unwrap_or("PICK"),
                        p.get("sku_id").and_then(|v| v.as_str()),
                        p.get("from_bin").and_then(|v| v.as_str()),
                        p.get("to_bin").and_then(|v| v.as_str()),
                        p.get("qty").and_then(|v| v.as_i64()).unwrap_or(0),
                        event.timestamp,
                    ],
                )?;
            }
            EventType::TaskCompleted => {
                self.conn.execute(
                    r#"UPDATE warehouse_tasks SET status = 'COMPLETED', completed_at = ?1
                       WHERE id = ?2"#,
                    params![event.timestamp, p["task_id"].as_str().unwrap_or("")],
                )?;
            }
            EventType::PeerConnected => {
                self.conn.execute(
                    r#"INSERT OR REPLACE INTO peer_relationships
                         (peer_did, display_name, trust_level, connected_at)
                       VALUES (?1, ?2, 'TRADING', ?3)"#,
                    params![
                        p["peer_did"].as_str().unwrap_or(""),
                        p.get("display_name").and_then(|v| v.as_str()),
                        event.timestamp,
                    ],
                )?;
            }
            // Remaining event types: logged but not yet projected
            _ => {
                tracing::debug!(
                    "event type {:?} not yet projected — stored in source_chain only",
                    event.event_type
                );
            }
        }
        Ok(())
    }
}

// ─── Schema SQL ──────────────────────────────────────────────────────────────

const SCHEMA_SQL: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Source chain (the immutable event log) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS source_chain (
  id           TEXT PRIMARY KEY,
  version      TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  author       TEXT NOT NULL,
  prev_hash    TEXT NOT NULL,
  payload      TEXT NOT NULL,   -- JSON
  signature    TEXT NOT NULL,
  timestamp    INTEGER NOT NULL,
  counterparty TEXT,
  their_sig    TEXT,
  dht_anchor   TEXT
);

-- ── Identity ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nodes (
  did          TEXT PRIMARY KEY,
  display_name TEXT,
  created_at   INTEGER NOT NULL
);

-- ── SKUs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skus (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  unit_of_measure     TEXT NOT NULL DEFAULT 'EACH',
  reorder_point       INTEGER NOT NULL DEFAULT 0,
  economic_order_qty  INTEGER NOT NULL DEFAULT 0,
  safety_stock        INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL
);

-- ── Locations ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  location_type TEXT NOT NULL,  -- WAREHOUSE | STORE | TRANSIT | SUPPLIER
  address       TEXT,
  created_at    INTEGER NOT NULL
);

-- ── Inventory ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_levels (
  sku_id      TEXT NOT NULL REFERENCES skus(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  qty_reserved INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (sku_id, location_id)
);

CREATE TABLE IF NOT EXISTS stock_events (
  id             TEXT PRIMARY KEY,
  event_chain_id TEXT NOT NULL REFERENCES source_chain(id),
  sku_id         TEXT NOT NULL REFERENCES skus(id),
  location_id    TEXT NOT NULL,
  delta          INTEGER NOT NULL,
  reason         TEXT NOT NULL,
  lot_number     TEXT,
  serial_number  TEXT,
  recorded_at    INTEGER NOT NULL
);

-- ── Purchase Orders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                TEXT PRIMARY KEY,
  supplier_did      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'DRAFT',
  total_value       REAL NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  expected_delivery INTEGER,
  confirmed_at      INTEGER,
  shipped_at        INTEGER,
  received_at       INTEGER,
  created_at        INTEGER NOT NULL,
  our_sig           TEXT,
  their_sig         TEXT,
  dht_anchor        TEXT
);

CREATE TABLE IF NOT EXISTS po_line_items (
  id          TEXT PRIMARY KEY,
  po_id       TEXT NOT NULL REFERENCES purchase_orders(id),
  sku_id      TEXT NOT NULL REFERENCES skus(id),
  qty_ordered INTEGER NOT NULL,
  unit_price  REAL NOT NULL,
  qty_received INTEGER NOT NULL DEFAULT 0
);

-- ── Delivery / Routes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_routes (
  id           TEXT PRIMARY KEY,
  driver_did   TEXT,
  status       TEXT NOT NULL DEFAULT 'PLANNED',
  total_stops  INTEGER NOT NULL DEFAULT 0,
  completed_stops INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS route_events (
  id         TEXT PRIMARY KEY,
  route_id   TEXT NOT NULL REFERENCES delivery_routes(id),
  stop_seq   INTEGER NOT NULL,
  location_id TEXT,
  event_type  TEXT NOT NULL,
  notes      TEXT,
  lat        REAL,
  lng        REAL,
  recorded_at INTEGER NOT NULL
);

-- ── Warehouse Tasks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_tasks (
  id           TEXT PRIMARY KEY,
  task_type    TEXT NOT NULL,   -- PICK | PUT | TRANSFER | COUNT | RECEIVE
  sku_id       TEXT REFERENCES skus(id),
  from_bin     TEXT,
  to_bin       TEXT,
  qty          INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'PENDING',
  assigned_to  TEXT,
  created_at   INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS bin_contents (
  bin_id   TEXT NOT NULL,
  sku_id   TEXT NOT NULL REFERENCES skus(id),
  qty      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (bin_id, sku_id)
);

-- ── Inspections ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_batches (
  id              TEXT PRIMARY KEY,
  po_id           TEXT REFERENCES purchase_orders(id),
  supplier_did    TEXT,
  status          TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  aql_level       TEXT NOT NULL DEFAULT 'NORMAL',
  sample_size     INTEGER NOT NULL DEFAULT 0,
  defects_found   INTEGER NOT NULL DEFAULT 0,
  result          TEXT,
  created_at      INTEGER NOT NULL,
  completed_at    INTEGER
);

CREATE TABLE IF NOT EXISTS inspection_items (
  id           TEXT PRIMARY KEY,
  batch_id     TEXT NOT NULL REFERENCES inspection_batches(id),
  sku_id       TEXT REFERENCES skus(id),
  result       TEXT NOT NULL,    -- PASS | FAIL | CONDITIONAL
  defect_type  TEXT,             -- CRITICAL | MAJOR | MINOR
  notes        TEXT,
  photo_hash   TEXT,
  inspected_at INTEGER NOT NULL
);

-- ── Forecasting ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forecast_runs (
  id           TEXT PRIMARY KEY,
  model_name   TEXT NOT NULL,
  model_version TEXT NOT NULL,
  horizon_days INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS forecast_values (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES forecast_runs(id),
  sku_id      TEXT NOT NULL REFERENCES skus(id),
  location_id TEXT NOT NULL,
  date_epoch  INTEGER NOT NULL,
  predicted   REAL NOT NULL,
  lower_bound REAL,
  upper_bound REAL
);

-- ── Peers ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS peer_relationships (
  peer_did     TEXT PRIMARY KEY,
  display_name TEXT,
  trust_level  TEXT NOT NULL DEFAULT 'PENDING',
  connected_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS shared_events (
  id            TEXT PRIMARY KEY,
  from_did      TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,  -- only the hash; payload stays on origin node
  dht_anchor    TEXT,
  received_at   INTEGER NOT NULL
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_source_chain_author     ON source_chain(author);
CREATE INDEX IF NOT EXISTS idx_source_chain_type       ON source_chain(event_type);
CREATE INDEX IF NOT EXISTS idx_stock_events_sku        ON stock_events(sku_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_sku        ON stock_levels(sku_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier             ON purchase_orders(supplier_did);
CREATE INDEX IF NOT EXISTS idx_po_status               ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_status  ON warehouse_tasks(status);
CREATE INDEX IF NOT EXISTS idx_inspection_batches_po   ON inspection_batches(po_id);
CREATE INDEX IF NOT EXISTS idx_forecast_values_sku     ON forecast_values(sku_id, date_epoch);
CREATE INDEX IF NOT EXISTS idx_shared_events_from      ON shared_events(from_did);
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;
    use crate::dag::{SourceChain, EventType};

    #[test]
    fn test_schema_init_and_persist() {
        let db = NodeDb::open_in_memory().unwrap();
        let id = Identity::generate().unwrap();
        let mut chain = SourceChain::genesis(&id).unwrap();

        let genesis = chain.events()[0].clone();
        db.persist_event(&genesis).unwrap();
        db.apply_event(&genesis).unwrap();

        // Verify node was projected
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM nodes", rusqlite::params![], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
