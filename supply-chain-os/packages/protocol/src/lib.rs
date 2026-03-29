/// Supply Chain OS — Sovereign Node Protocol Core
///
/// This crate is the shared Rust library that powers both the Tauri desktop
/// node and (via WASM/FFI) the Expo mobile node. It contains:
///
/// - `identity` — DID keypair generation, signing, verification
/// - `dag`      — Source chain (append-only event log), event envelope
/// - `sync`     — CRDT merge via Automerge (own-device sync)
/// - `p2p`      — libp2p transport, peer sessions, DHT participation
/// - `db`       — SQLite schema init, event projection engine

pub mod identity;
pub mod dag;
pub mod sync;
pub mod p2p;
pub mod db;
pub mod inventory;
pub mod procurement;
pub mod warehouse;
pub mod logistics;
pub mod quality;
pub mod forecasting;

pub use identity::Identity;
pub use dag::{SourceChain, ChainEvent, EventType};
pub use db::NodeDb;
pub use inventory::{
    SkuInput, SkuRow, StockLevelRow, StockEventRow, ReorderAlert,
    CountInput, CountResult,
};
pub use procurement::{
    CreatePoInput, LineItemInput, ReceivedItem, PurchaseOrder, PoLineItem, PoDetail,
    StatusTransition, SupplierScorecard, ProcurementError,
};
pub use quality::{
    start_inspection, inspect_item, complete_batch, raise_ncr, resolve_ncr,
    get_supplier_quality, list_inspections, get_batch_detail,
    InspectionRow, ItemResult, BatchDetail, SupplierQuality, DefectSummary,
};
pub use forecasting::{
    run_forecast, get_forecast, get_all_forecasts, apply_override,
    get_demand_history, check_accuracy, detect_anomalies, suggest_reorder,
    ForecastRun, ForecastValue, ForecastSummary, DemandPoint,
    AccuracyMetrics, Anomaly, ReorderSuggestion,
};

/// Protocol version — bump on breaking event-format changes
pub const PROTOCOL_VERSION: &str = "0.1.0";
