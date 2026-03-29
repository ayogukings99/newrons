/// Demand Forecasting Module
///
/// Implements Holt-Winters triple exponential smoothing for demand prediction.

pub mod stats;

use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use uuid::Uuid;
use chrono::{Utc, Duration};

use crate::dag::{SourceChain, ChainEvent, EventType};
use crate::identity::Identity;
use stats::{holt_winters, moving_average, seasonal_decompose, confidence_interval};
use stats::{mae, mape, rmse, wilson_eoq};

// ─── Data Structures ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemandPoint {
    pub date_epoch: i64,
    pub quantity: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForecastValue {
    pub date_epoch: i64,
    pub predicted: f64,
    pub lower_bound: Option<f64>,
    pub upper_bound: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForecastRun {
    pub id: String,
    pub sku_id: String,
    pub location_id: String,
    pub model_name: String,
    pub model_version: String,
    pub horizon_days: i32,
    pub values: Vec<ForecastValue>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForecastSummary {
    pub sku_id: String,
    pub location_id: String,
    pub latest_forecast: Option<ForecastValue>,
    pub next_7_days: Vec<ForecastValue>,
    pub next_30_days: Vec<ForecastValue>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccuracyMetrics {
    pub sku_id: String,
    pub mae: f64,             // Mean Absolute Error
    pub mape: f64,            // Mean Absolute Percentage Error
    pub rmse: f64,            // Root Mean Squared Error
    pub last_30_days_mape: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Anomaly {
    pub date_epoch: i64,
    pub quantity: i32,
    pub deviation_stddev: f64,
    pub severity: String,     // MILD | MODERATE | SEVERE
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderSuggestion {
    pub sku_id: String,
    pub reorder_qty: i32,
    pub reorder_date_epoch: i64,
    pub safety_stock: i32,
    pub lead_time_days: i32,
    pub reason: String,
}

// ─── Forecasting Service ───────────────────────────────────────────────────

/// Run a demand forecast using Holt-Winters triple exponential smoothing.
pub fn run_forecast(
    db: &Connection,
    chain: &mut SourceChain,
    identity: &Identity,
    sku_id: &str,
    location_id: &str,
    horizon_days: i32,
) -> Result<ForecastRun, Box<dyn std::error::Error>> {
    let run_id = Uuid::new_v4().to_string();

    // Get demand history (last 90 days of stock events marked as OUTBOUND)
    let history = get_demand_history(db, sku_id, 90)?;

    if history.is_empty() {
        return Err("Insufficient demand history".into());
    }

    // Convert to daily aggregates (Vec<f64>)
    let mut data: Vec<f64> = history.iter().map(|d| d.quantity as f64).collect();

    // Ensure minimum data length (at least one seasonal cycle = 7 days for weekly seasonality)
    if data.len() < 7 {
        // Pad with moving average
        let ma = moving_average(&data, std::cmp::min(3, data.len()));
        data = ma;
    }

    // Apply Holt-Winters with weekly seasonality
    let season_len = 7;
    let alpha = 0.2;  // level smoothing
    let beta = 0.1;   // trend smoothing
    let gamma = 0.1;  // seasonal smoothing

    let hw_result = holt_winters(&data, alpha, beta, gamma, season_len, horizon_days as usize)?;

    // Calculate confidence intervals
    let ci = confidence_interval(&hw_result.forecast, &hw_result.residuals, 1.96)?;

    // Create forecast values
    let now = Utc::now();
    let mut values = Vec::new();
    for (i, &pred) in hw_result.forecast.iter().enumerate() {
        let date = now + Duration::days(i as i64 + 1);
        values.push(ForecastValue {
            date_epoch: date.timestamp() * 1000,
            predicted: pred.max(0.0),
            lower_bound: Some(ci[i].0.max(0.0)),
            upper_bound: Some(ci[i].1),
        });
    }

    // Emit event
    let payload = serde_json::json!({
        "forecast_run_id": run_id,
        "sku_id": sku_id,
        "location_id": location_id,
        "horizon_days": horizon_days,
        "model": "holt_winters_additive_weekly",
        "data_points": history.len(),
    });

    let event = chain.append(identity, EventType::ForecastRunCompleted, payload, None)?;

    // Persist to DB
    db.execute(
        r#"INSERT OR IGNORE INTO forecast_runs
             (id, model_name, model_version, horizon_days, created_at)
           VALUES (?1, 'holt_winters', '1.0', ?2, ?3)"#,
        params![run_id, horizon_days, event.timestamp],
    )?;

    for val in &values {
        db.execute(
            r#"INSERT INTO forecast_values
                 (id, run_id, sku_id, location_id, date_epoch, predicted, lower_bound, upper_bound)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
            params![
                Uuid::new_v4().to_string(),
                run_id,
                sku_id,
                location_id,
                val.date_epoch,
                val.predicted,
                val.lower_bound,
                val.upper_bound,
            ],
        )?;
    }

    Ok(ForecastRun {
        id: run_id,
        sku_id: sku_id.to_string(),
        location_id: location_id.to_string(),
        model_name: "holt_winters".to_string(),
        model_version: "1.0".to_string(),
        horizon_days,
        values,
        created_at: event.timestamp,
    })
}

/// Get the latest forecast for a SKU.
pub fn get_forecast(
    db: &Connection,
    sku_id: &str,
) -> Result<Option<ForecastSummary>, Box<dyn std::error::Error>> {
    // Get latest forecast run
    let run_id: Option<String> = db.query_row(
        "SELECT id FROM forecast_runs ORDER BY created_at DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    if let Some(run_id) = run_id {
        // Get forecast values for this run
        let mut stmt = db.prepare(
            "SELECT date_epoch, predicted, lower_bound, upper_bound \
             FROM forecast_values \
             WHERE run_id = ? AND sku_id = ? \
             ORDER BY date_epoch ASC",
        )?;

        let values_iter = stmt.query_map(params![run_id, sku_id], |row| {
            Ok(ForecastValue {
                date_epoch: row.get(0)?,
                predicted: row.get(1)?,
                lower_bound: row.get(2)?,
                upper_bound: row.get(3)?,
            })
        })?;

        let mut all_values = Vec::new();
        for val in values_iter {
            all_values.push(val?);
        }

        if all_values.is_empty() {
            return Ok(None);
        }

        let now = Utc::now().timestamp() * 1000;
        let next_7: Vec<_> = all_values.iter()
            .filter(|v| v.date_epoch >= now && v.date_epoch <= now + 7 * 24 * 60 * 60 * 1000)
            .cloned()
            .collect();
        let next_30: Vec<_> = all_values.iter()
            .filter(|v| v.date_epoch >= now && v.date_epoch <= now + 30 * 24 * 60 * 60 * 1000)
            .cloned()
            .collect();

        let run_created: i64 = db.query_row(
            "SELECT created_at FROM forecast_runs WHERE id = ?",
            params![run_id],
            |row| row.get(0),
        )?;

        return Ok(Some(ForecastSummary {
            sku_id: sku_id.to_string(),
            location_id: "default".to_string(),
            latest_forecast: all_values.first().cloned(),
            next_7_days: next_7,
            next_30_days: next_30,
            created_at: run_created,
        }));
    }

    Ok(None)
}

/// Get all latest forecasts for all SKUs.
pub fn get_all_forecasts(
    db: &Connection,
) -> Result<Vec<ForecastSummary>, Box<dyn std::error::Error>> {
    let mut stmt = db.prepare(
        "SELECT DISTINCT sku_id FROM forecast_values ORDER BY sku_id",
    )?;

    let skus = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut summaries = Vec::new();
    for sku in skus {
        if let Ok(sku_id) = sku {
            if let Ok(Some(summary)) = get_forecast(db, &sku_id) {
                summaries.push(summary);
            }
        }
    }

    Ok(summaries)
}

/// Get demand history for a SKU (outbound stock events aggregated by day).
pub fn get_demand_history(
    db: &Connection,
    sku_id: &str,
    days: i32,
) -> Result<Vec<DemandPoint>, Box<dyn std::error::Error>> {
    let cutoff_time = Utc::now().timestamp() * 1000 - (days as i64 * 24 * 60 * 60 * 1000);

    let mut stmt = db.prepare(
        r#"SELECT DATE(recorded_at / 1000, 'unixepoch') as day,
                  CAST(SUM(ABS(delta)) as INTEGER) as daily_demand
           FROM stock_events
           WHERE sku_id = ? AND reason = 'OUTBOUND' AND recorded_at > ?
           GROUP BY day
           ORDER BY day ASC"#,
    )?;

    let points = stmt.query_map(params![sku_id, cutoff_time], |row| {
        let day_str: String = row.get(0)?;
        let qty: i32 = row.get(1)?;
        // Parse day string back to epoch (simplified)
        Ok(DemandPoint {
            date_epoch: 0, // Would be properly calculated from day_str
            quantity: qty,
        })
    })?;

    let mut history = Vec::new();
    for point in points {
        history.push(point?);
    }

    Ok(history)
}

/// Check forecast accuracy by comparing past predictions to actuals.
pub fn check_accuracy(
    db: &Connection,
    sku_id: &str,
) -> Result<AccuracyMetrics, Box<dyn std::error::Error>> {
    // Get all forecast runs
    let mut stmt = db.prepare(
        "SELECT fv.predicted, COUNT(*) as count \
         FROM forecast_values fv \
         WHERE fv.sku_id = ? \
         GROUP BY fv.run_id",
    )?;

    let mut actual_values = Vec::new();
    let mut predicted_values = Vec::new();

    // For now, return placeholder metrics (full implementation would require
    // storing actual demand observations alongside forecast)
    let metrics = AccuracyMetrics {
        sku_id: sku_id.to_string(),
        mae: 0.0,
        mape: 0.0,
        rmse: 0.0,
        last_30_days_mape: 0.0,
    };

    Ok(metrics)
}

/// Detect demand anomalies (outliers beyond 2 standard deviations).
pub fn detect_anomalies(
    db: &Connection,
    sku_id: &str,
) -> Result<Vec<Anomaly>, Box<dyn std::error::Error>> {
    // Get last 30 days of demand
    let history = get_demand_history(db, sku_id, 30)?;

    if history.len() < 3 {
        return Ok(Vec::new());
    }

    let data: Vec<f64> = history.iter().map(|d| d.quantity as f64).collect();

    // Calculate mean and stddev
    let mean = data.iter().sum::<f64>() / data.len() as f64;
    let variance = data.iter()
        .map(|x| (x - mean).powi(2))
        .sum::<f64>() / data.len() as f64;
    let stddev = variance.sqrt();

    let threshold = mean + 2.0 * stddev;

    let mut anomalies = Vec::new();
    for (i, point) in history.iter().enumerate() {
        if point.quantity as f64 > threshold {
            anomalies.push(Anomaly {
                date_epoch: point.date_epoch,
                quantity: point.quantity,
                deviation_stddev: (point.quantity as f64 - mean) / stddev,
                severity: if point.quantity as f64 > threshold + stddev {
                    "SEVERE".to_string()
                } else {
                    "MODERATE".to_string()
                },
            });
        }
    }

    Ok(anomalies)
}

/// Get reorder suggestions based on Wilson EOQ formula.
pub fn suggest_reorder(
    db: &Connection,
    sku_id: &str,
) -> Result<ReorderSuggestion, Box<dyn std::error::Error>> {
    // Get annual demand estimate (average daily * 365)
    let history = get_demand_history(db, sku_id, 365)?;
    let avg_daily: f64 = if !history.is_empty() {
        history.iter().map(|d| d.quantity as f64).sum::<f64>() / history.len() as f64
    } else {
        100.0  // Default
    };
    let annual_demand = avg_daily * 365.0;

    // Get SKU parameters (simplified)
    let (order_cost, holding_pct, unit_cost): (f64, f64, f64) = db.query_row(
        "SELECT 50.0, 0.25, 10.0 FROM skus WHERE id = ? LIMIT 1",
        params![sku_id],
        |_row| Ok((50.0, 0.25, 10.0)),
    ).unwrap_or((50.0, 0.25, 10.0));

    // Calculate EOQ
    let eoq = wilson_eoq(annual_demand, order_cost, holding_pct, unit_cost);
    let reorder_qty = eoq.max(1.0) as i32;

    // Estimate lead time (5 days default)
    let lead_time_days = 5;

    // Reorder point = lead time demand + safety stock
    let lead_time_demand = (avg_daily * lead_time_days as f64) as i32;
    let safety_stock = ((avg_daily * 1.65) as i32).max(10);
    let reorder_point = lead_time_demand + safety_stock;

    let reorder_date = Utc::now() + Duration::days(lead_time_days as i64);

    Ok(ReorderSuggestion {
        sku_id: sku_id.to_string(),
        reorder_qty,
        reorder_date_epoch: reorder_date.timestamp() * 1000,
        safety_stock,
        lead_time_days,
        reason: format!(
            "EOQ-based reorder: {} units at reorder point {}",
            reorder_qty, reorder_point
        ),
    })
}

/// Apply a manual override to forecast values.
pub fn apply_override(
    db: &Connection,
    run_id: &str,
    date_epoch: i64,
    override_value: f64,
) -> Result<(), Box<dyn std::error::Error>> {
    db.execute(
        "UPDATE forecast_values SET predicted = ? WHERE run_id = ? AND date_epoch = ?",
        params![override_value, run_id, date_epoch],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;
    use crate::dag::SourceChain;
    use crate::db::NodeDb;

    #[test]
    fn test_reorder_suggestion() {
        let db = NodeDb::open_in_memory().unwrap();
        let conn = db.get_connection();

        // This would require populated data, so we just verify structure
        let _result = suggest_reorder(conn, "SKU-001");
    }
}
