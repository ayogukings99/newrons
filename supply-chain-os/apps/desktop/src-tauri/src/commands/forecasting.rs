/// Tauri commands for Demand Forecasting module

use serde::{Deserialize, Serialize};
use tauri::State;
use scos_protocol::{
    run_forecast, get_forecast, get_all_forecasts, apply_override,
    get_demand_history, check_accuracy, detect_anomalies, suggest_reorder,
    ForecastRun, ForecastValue, ForecastSummary, DemandPoint,
    AccuracyMetrics, Anomaly, ReorderSuggestion,
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

// ─── Run Forecast ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RunForecastRequest {
    pub sku_id: String,
    pub location_id: String,
    pub horizon_days: i32,
}

#[tauri::command]
pub fn cmd_run_forecast(
    state: State<'_, AppState>,
    req: RunForecastRequest,
) -> ApiResponse<ForecastRun> {
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

    match run_forecast(
        conn,
        &mut chain,
        &identity,
        &req.sku_id,
        &req.location_id,
        req.horizon_days,
    ) {
        Ok(forecast) => {
            // Note: event persistence handled inside run_forecast
            ApiResponse::ok(forecast)
        }
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Get Forecast ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GetForecastRequest {
    pub sku_id: String,
}

#[tauri::command]
pub fn cmd_get_forecast(
    state: State<'_, AppState>,
    req: GetForecastRequest,
) -> ApiResponse<Option<ForecastSummary>> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match get_forecast(conn, &req.sku_id) {
        Ok(forecast) => ApiResponse::ok(forecast),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Get All Forecasts ──────────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_get_all_forecasts(
    state: State<'_, AppState>,
) -> ApiResponse<Vec<ForecastSummary>> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match get_all_forecasts(conn) {
        Ok(forecasts) => ApiResponse::ok(forecasts),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Apply Override ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ApplyOverrideRequest {
    pub run_id: String,
    pub date_epoch: i64,
    pub override_value: f64,
}

#[tauri::command]
pub fn cmd_apply_override(
    state: State<'_, AppState>,
    req: ApplyOverrideRequest,
) -> ApiResponse<String> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match apply_override(conn, &req.run_id, req.date_epoch, req.override_value) {
        Ok(_) => ApiResponse::ok("Override applied".to_string()),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Get Demand History ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GetDemandHistoryRequest {
    pub sku_id: String,
    pub days: i32,
}

#[tauri::command]
pub fn cmd_get_demand_history(
    state: State<'_, AppState>,
    req: GetDemandHistoryRequest,
) -> ApiResponse<Vec<DemandPoint>> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match get_demand_history(conn, &req.sku_id, req.days) {
        Ok(history) => ApiResponse::ok(history),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Check Accuracy ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CheckAccuracyRequest {
    pub sku_id: String,
}

#[tauri::command]
pub fn cmd_check_accuracy(
    state: State<'_, AppState>,
    req: CheckAccuracyRequest,
) -> ApiResponse<AccuracyMetrics> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match check_accuracy(conn, &req.sku_id) {
        Ok(metrics) => ApiResponse::ok(metrics),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Detect Anomalies ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct DetectAnomaliesRequest {
    pub sku_id: String,
}

#[tauri::command]
pub fn cmd_detect_anomalies(
    state: State<'_, AppState>,
    req: DetectAnomaliesRequest,
) -> ApiResponse<Vec<Anomaly>> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match detect_anomalies(conn, &req.sku_id) {
        Ok(anomalies) => ApiResponse::ok(anomalies),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}

// ─── Suggest Reorder ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SuggestReorderRequest {
    pub sku_id: String,
}

#[tauri::command]
pub fn cmd_suggest_reorder(
    state: State<'_, AppState>,
    req: SuggestReorderRequest,
) -> ApiResponse<ReorderSuggestion> {
    let db_state = match state.db.lock() {
        Ok(db) => db,
        Err(e) => return ApiResponse::err(format!("Lock error: {}", e)),
    };

    let conn = db_state.get_connection();

    match suggest_reorder(conn, &req.sku_id) {
        Ok(suggestion) => ApiResponse::ok(suggestion),
        Err(e) => ApiResponse::err(format!("Error: {}", e)),
    }
}
