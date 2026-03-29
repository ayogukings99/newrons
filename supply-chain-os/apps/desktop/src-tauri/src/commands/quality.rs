/// Tauri commands for Quality Control module

use serde::{Deserialize, Serialize};
use tauri::State;
use scos_protocol::{
    start_inspection, inspect_item, complete_batch, raise_ncr, resolve_ncr,
    get_supplier_quality, list_inspections, get_batch_detail,
    InspectionRow, ItemResult, BatchDetail, SupplierQuality, DefectSummary,
    SourceChain, Identity, NodeDb,
};
use std::sync::Mutex;

// Application state
pub struct AppState {
    pub chain: Mutex<SourceChain>,
    pub identity: Mutex<Identity>,
    pub db: Mutex<NodeDb>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: String) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

// ─── Start Inspection ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct StartInspectionRequest {
    pub po_id: String,
    pub supplier_did: String,
    pub aql_level: String,
    pub sample_size: i32,
}

#[tauri::command]
pub fn cmd_start_inspection(
    state: State<'_, AppState>,
    req: StartInspectionRequest,
) -> ApiResponse<String> {
    let mut chain = match state.chain.lock() {
        Ok(c) => c,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let identity = match state.identity.lock() {
        Ok(i) => i,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match start_inspection(
        conn,
        &mut chain,
        &identity,
        &req.po_id,
        &req.supplier_did,
        &req.aql_level,
        req.sample_size,
    ) {
        Ok(event) => {
            if let Err(e) = db_state.persist_event(&event) {
                return ApiResponse::err(format!("Persist error: {}", e));
            }
            if let Err(e) = db_state.apply_event(&event) {
                return ApiResponse::err(format!("Apply error: {}", e));
            }
            ApiResponse::ok(event.id)
        }
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Inspect Item ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct InspectItemRequest {
    pub batch_id: String,
    pub sku_id: String,
    pub result: String,
    pub defect_type: Option<String>,
    pub notes: Option<String>,
    pub photo_hash: Option<String>,
}

#[tauri::command]
pub fn cmd_inspect_item(
    state: State<'_, AppState>,
    req: InspectItemRequest,
) -> ApiResponse<String> {
    let mut chain = match state.chain.lock() {
        Ok(c) => c,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let identity = match state.identity.lock() {
        Ok(i) => i,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match inspect_item(
        conn,
        &mut chain,
        &identity,
        &req.batch_id,
        &req.sku_id,
        &req.result,
        req.defect_type.as_deref(),
        req.notes.as_deref(),
        req.photo_hash.as_deref(),
    ) {
        Ok(event) => {
            if let Err(e) = db_state.persist_event(&event) {
                return ApiResponse::err(format!("Persist error: {}", e));
            }
            if let Err(e) = db_state.apply_event(&event) {
                return ApiResponse::err(format!("Apply error: {}", e));
            }
            ApiResponse::ok(event.id)
        }
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Complete Batch ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CompleteBatchRequest {
    pub batch_id: String,
}

#[tauri::command]
pub fn cmd_complete_batch(
    state: State<'_, AppState>,
    req: CompleteBatchRequest,
) -> ApiResponse<serde_json::json::Value> {
    let mut chain = match state.chain.lock() {
        Ok(c) => c,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let identity = match state.identity.lock() {
        Ok(i) => i,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match complete_batch(conn, &mut chain, &identity, &req.batch_id) {
        Ok(event) => {
            if let Err(e) = db_state.persist_event(&event) {
                return ApiResponse::err(format!("Persist error: {}", e));
            }
            if let Err(e) = db_state.apply_event(&event) {
                return ApiResponse::err(format!("Apply error: {}", e));
            }

            // Return batch detail
            match get_batch_detail(conn, &req.batch_id) {
                Ok(batch) => ApiResponse::ok(serde_json::to_value(batch).unwrap()),
                Err(e) => ApiResponse::err(format!("Get batch error: {}", e)),
            }
        }
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Raise NCR ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RaiseNcrRequest {
    pub batch_id: String,
    pub description: String,
}

#[tauri::command]
pub fn cmd_raise_ncr(
    state: State<'_, AppState>,
    req: RaiseNcrRequest,
) -> ApiResponse<String> {
    let mut chain = match state.chain.lock() {
        Ok(c) => c,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let identity = match state.identity.lock() {
        Ok(i) => i,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match raise_ncr(conn, &mut chain, &identity, &req.batch_id, &req.description) {
        Ok(event) => {
            if let Err(e) = db_state.persist_event(&event) {
                return ApiResponse::err(format!("Persist error: {}", e));
            }
            if let Err(e) = db_state.apply_event(&event) {
                return ApiResponse::err(format!("Apply error: {}", e));
            }
            ApiResponse::ok(event.id)
        }
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── List Inspections ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ListInspectionsRequest {
    pub status: Option<String>,
}

#[tauri::command]
pub fn cmd_list_inspections(
    state: State<'_, AppState>,
    req: ListInspectionsRequest,
) -> ApiResponse<Vec<InspectionRow>> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match list_inspections(conn, req.status.as_deref()) {
        Ok(inspections) => ApiResponse::ok(inspections),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Get Batch Detail ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GetBatchDetailRequest {
    pub batch_id: String,
}

#[tauri::command]
pub fn cmd_get_batch_detail(
    state: State<'_, AppState>,
    req: GetBatchDetailRequest,
) -> ApiResponse<BatchDetail> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match get_batch_detail(conn, &req.batch_id) {
        Ok(batch) => ApiResponse::ok(batch),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Get Supplier Quality ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GetSupplierQualityRequest {
    pub supplier_did: String,
}

#[tauri::command]
pub fn cmd_get_supplier_quality(
    state: State<'_, AppState>,
    req: GetSupplierQualityRequest,
) -> ApiResponse<SupplierQuality> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match get_supplier_quality(conn, &req.supplier_did) {
        Ok(quality) => ApiResponse::ok(quality),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}
