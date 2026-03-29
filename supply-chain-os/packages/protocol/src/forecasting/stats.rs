/// Statistical Methods for Forecasting
///
/// Pure Rust implementation of time series analysis algorithms:
/// - Holt-Winters triple exponential smoothing with additive seasonality
/// - Seasonal decomposition
/// - Accuracy metrics (MAE, MAPE, RMSE)
/// - Economic order quantity (Wilson EOQ)
/// - Confidence intervals

use thiserror::Error;
use std::collections::VecDeque;

#[derive(Debug, Error)]
pub enum StatsError {
    #[error("insufficient data: need at least {0} points")]
    InsufficientData(usize),
    #[error("invalid parameter: {0}")]
    InvalidParameter(String),
    #[error("calculation error: {0}")]
    CalculationError(String),
}

// ─── Holt-Winters Triple Exponential Smoothing ───────────────────────────────

#[derive(Debug, Clone)]
pub struct HoltWintersResult {
    pub fitted: Vec<f64>,      // Fitted values for historical data
    pub forecast: Vec<f64>,    // Forecast values for future periods
    pub residuals: Vec<f64>,   // Residuals = actual - fitted
    pub level: Vec<f64>,       // Level component
    pub trend: Vec<f64>,       // Trend component
    pub season: Vec<f64>,      // Seasonal components
}

/// Holt-Winters additive seasonality (HoltWinters Additive)
///
/// MATHEMATICALLY CORRECT triple exponential smoothing:
/// - Level: l_t = α(y_t - s_{t-m}) + (1-α)(l_{t-1} + b_{t-1})
/// - Trend: b_t = β(l_t - l_{t-1}) + (1-β)b_{t-1}
/// - Season: s_t = γ(y_t - l_t) + (1-γ)s_{t-m}
/// - Forecast: f_{t+h} = l_t + h·b_t + s_{t-m+((h-1) mod m)+1}
///
/// Where:
/// - α (alpha): level smoothing (0 < α < 1), typically 0.1-0.3
/// - β (beta): trend smoothing (0 < β < 1), typically 0.05-0.1
/// - γ (gamma): seasonal smoothing (0 < γ < 1), typically 0.1-0.2
/// - m: seasonal period (e.g., 7 for weekly, 12 for monthly)
pub fn holt_winters(
    data: &[f64],
    alpha: f64,
    beta: f64,
    gamma: f64,
    season_len: usize,
    horizon: usize,
) -> Result<HoltWintersResult, StatsError> {
    // Validate inputs
    if data.is_empty() {
        return Err(StatsError::InsufficientData(1));
    }
    if data.len() < season_len {
        return Err(StatsError::InsufficientData(season_len));
    }
    if !(0.0 < alpha && alpha < 1.0) {
        return Err(StatsError::InvalidParameter("alpha must be in (0, 1)".into()));
    }
    if !(0.0 < beta && beta < 1.0) {
        return Err(StatsError::InvalidParameter("beta must be in (0, 1)".into()));
    }
    if !(0.0 < gamma && gamma < 1.0) {
        return Err(StatsError::InvalidParameter("gamma must be in (0, 1)".into()));
    }

    let n = data.len();
    let mut level = vec![0.0; n + horizon];
    let mut trend = vec![0.0; n + horizon];
    let mut season = vec![0.0; n + horizon + season_len];
    let mut fitted = vec![0.0; n];
    let mut residuals = vec![0.0; n];
    let mut forecast = vec![0.0; horizon];

    // ─── Initialization ───────────────────────────────────────────────────────
    // Initialize level (average of first season)
    let initial_level: f64 = data.iter().take(season_len).sum::<f64>() / season_len as f64;
    level[0] = initial_level;

    // Initialize trend (average slope between first and second season)
    let trend_num = if n >= 2 * season_len {
        let second_season_avg: f64 = data.iter().skip(season_len).take(season_len).sum::<f64>() / season_len as f64;
        (second_season_avg - initial_level) / season_len as f64
    } else {
        0.0
    };
    trend[0] = trend_num;

    // Initialize seasonal components
    for i in 0..season_len {
        if i < data.len() {
            season[i] = data[i] - initial_level;
        }
    }

    // ─── Filtering Phase ─────────────────────────────────────────────────────
    // Fit the model to historical data
    for t in 1..n {
        // Previous indices
        let l_prev = level[t - 1];
        let b_prev = trend[t - 1];
        let s_prev_m = if t >= season_len {
            season[t - season_len]
        } else {
            season[t - season_len + season_len]
        };

        // Level update: l_t = α(y_t - s_{t-m}) + (1-α)(l_{t-1} + b_{t-1})
        level[t] = alpha * (data[t] - s_prev_m) + (1.0 - alpha) * (l_prev + b_prev);

        // Trend update: b_t = β(l_t - l_{t-1}) + (1-β)b_{t-1}
        trend[t] = beta * (level[t] - l_prev) + (1.0 - beta) * b_prev;

        // Seasonal update: s_t = γ(y_t - l_t) + (1-γ)s_{t-m}
        season[t] = gamma * (data[t] - level[t]) + (1.0 - gamma) * s_prev_m;

        // Fitted value: f_t = l_{t-1} + b_{t-1} + s_{t-m}
        fitted[t] = l_prev + b_prev + s_prev_m;

        // Residual
        residuals[t] = data[t] - fitted[t];
    }

    // ─── Forecasting Phase ──────────────────────────────────────────────────
    // Generate forecasts for horizon periods
    let l_final = level[n - 1];
    let b_final = trend[n - 1];

    for h in 1..=horizon {
        // Forecast: f_{t+h} = l_t + h·b_t + s_{t-m+((h-1) mod m)+1}
        let seasonal_idx = ((n - season_len) + ((h - 1) % season_len)) % (n + season_len);
        let s_component = if seasonal_idx < season.len() {
            season[seasonal_idx]
        } else {
            0.0
        };

        forecast[h - 1] = l_final + (h as f64) * b_final + s_component;
    }

    Ok(HoltWintersResult {
        fitted,
        forecast,
        residuals,
        level: level[..n].to_vec(),
        trend: trend[..n].to_vec(),
        season: season[..season_len].to_vec(),
    })
}

// ─── Simple Exponential Smoothing ────────────────────────────────────────────

pub fn exponential_smoothing(data: &[f64], alpha: f64) -> Result<Vec<f64>, StatsError> {
    if data.is_empty() {
        return Err(StatsError::InsufficientData(1));
    }
    if !(0.0 < alpha && alpha < 1.0) {
        return Err(StatsError::InvalidParameter("alpha must be in (0, 1)".into()));
    }

    let mut result = vec![0.0; data.len()];
    result[0] = data[0];

    for t in 1..data.len() {
        result[t] = alpha * data[t] + (1.0 - alpha) * result[t - 1];
    }

    Ok(result)
}

// ─── Moving Average ──────────────────────────────────────────────────────────

pub fn moving_average(data: &[f64], window: usize) -> Vec<f64> {
    if window == 0 || data.is_empty() {
        return data.to_vec();
    }

    let w = window.min(data.len());
    let mut result = Vec::with_capacity(data.len());

    for i in 0..data.len() {
        let start = if i >= w { i - w + 1 } else { 0 };
        let end = i + 1;
        let slice = &data[start..end];
        let avg = slice.iter().sum::<f64>() / slice.len() as f64;
        result.push(avg);
    }

    result
}

// ─── Seasonal Decomposition ──────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Decomposition {
    pub trend: Vec<f64>,
    pub seasonal: Vec<f64>,
    pub residual: Vec<f64>,
}

pub fn seasonal_decompose(
    data: &[f64],
    period: usize,
) -> Result<Decomposition, StatsError> {
    if data.is_empty() || period == 0 {
        return Err(StatsError::InsufficientData(period));
    }

    // Trend via centered moving average
    let trend = moving_average(data, period);

    // Seasonal: average by period position
    let mut seasonal = vec![0.0; data.len()];
    let mut counts = vec![0; period];
    let mut sums = vec![0.0; period];

    for (i, &val) in data.iter().enumerate() {
        let idx = i % period;
        sums[idx] += val - trend[i];
        counts[idx] += 1;
    }

    for i in 0..period {
        if counts[i] > 0 {
            let avg = sums[i] / counts[i] as f64;
            for j in (i..data.len()).step_by(period) {
                seasonal[j] = avg;
            }
        }
    }

    // Residual
    let residual = data.iter()
        .zip(trend.iter())
        .zip(seasonal.iter())
        .map(|((y, t), s)| y - t - s)
        .collect();

    Ok(Decomposition {
        trend,
        seasonal,
        residual,
    })
}

// ─── Accuracy Metrics ────────────────────────────────────────────────────────

/// Mean Absolute Error
pub fn mae(actual: &[f64], predicted: &[f64]) -> f64 {
    if actual.is_empty() {
        return 0.0;
    }
    let sum: f64 = actual.iter()
        .zip(predicted.iter())
        .map(|(a, p)| (a - p).abs())
        .sum();
    sum / actual.len() as f64
}

/// Mean Absolute Percentage Error (handles zero denominator)
pub fn mape(actual: &[f64], predicted: &[f64]) -> f64 {
    if actual.is_empty() {
        return 0.0;
    }
    let sum: f64 = actual.iter()
        .zip(predicted.iter())
        .filter(|(a, _)| a.abs() > 1e-10)
        .map(|(a, p)| ((a - p) / a).abs())
        .sum();
    sum / actual.len() as f64 * 100.0
}

/// Root Mean Squared Error
pub fn rmse(actual: &[f64], predicted: &[f64]) -> f64 {
    if actual.is_empty() {
        return 0.0;
    }
    let sum: f64 = actual.iter()
        .zip(predicted.iter())
        .map(|(a, p)| (a - p).powi(2))
        .sum();
    (sum / actual.len() as f64).sqrt()
}

// ─── Confidence Intervals ────────────────────────────────────────────────────

pub fn confidence_interval(
    forecast: &[f64],
    residuals: &[f64],
    z_score: f64,
) -> Result<Vec<(f64, f64)>, StatsError> {
    if forecast.is_empty() {
        return Ok(Vec::new());
    }

    let residual_mean = residuals.iter().sum::<f64>() / residuals.len().max(1) as f64;
    let residual_variance: f64 = residuals.iter()
        .map(|r| (r - residual_mean).powi(2))
        .sum::<f64>() / residuals.len().max(1) as f64;
    let residual_std = residual_variance.sqrt();

    let margin = z_score * residual_std;

    let intervals = forecast.iter()
        .map(|f| (f - margin, f + margin))
        .collect();

    Ok(intervals)
}

// ─── Economic Order Quantity (Wilson Formula) ────────────────────────────────

/// Wilson EOQ formula: sqrt(2·D·S / (H·C))
///
/// Where:
/// - D: annual demand (units)
/// - S: order/setup cost (per order)
/// - H: holding cost as percentage of unit cost (0 < H < 1)
/// - C: unit cost
pub fn wilson_eoq(annual_demand: f64, order_cost: f64, holding_pct: f64, unit_cost: f64) -> f64 {
    if annual_demand <= 0.0 || order_cost <= 0.0 || holding_pct <= 0.0 || unit_cost <= 0.0 {
        return 100.0; // Default fallback
    }

    let holding_cost = holding_pct * unit_cost;
    let numerator = 2.0 * annual_demand * order_cost;
    let denominator = holding_cost;

    (numerator / denominator).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_holt_winters_basic() {
        // Weekly seasonal data: baseline 100 with 7-day cycle
        let data = vec![100.0, 102.0, 98.0, 101.0, 103.0, 99.0, 97.0,
                       100.0, 102.0, 98.0, 101.0, 103.0, 99.0, 97.0];

        let result = holt_winters(&data, 0.2, 0.1, 0.1, 7, 7).unwrap();

        assert_eq!(result.forecast.len(), 7);
        assert_eq!(result.fitted.len(), data.len());
        assert!(result.forecast.iter().all(|x| x.is_finite()));
    }

    #[test]
    fn test_moving_average() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let ma = moving_average(&data, 3);

        assert_eq!(ma.len(), data.len());
        assert!((ma[2] - 2.0).abs() < 1e-10);  // (1+2+3)/3 = 2
        assert!((ma[3] - 3.0).abs() < 1e-10);  // (2+3+4)/3 = 3
    }

    #[test]
    fn test_mae_mape_rmse() {
        let actual = vec![100.0, 110.0, 120.0];
        let predicted = vec![105.0, 115.0, 125.0];

        let mae_val = mae(&actual, &predicted);
        assert!((mae_val - 5.0).abs() < 1e-10);

        let rmse_val = rmse(&actual, &predicted);
        assert!((rmse_val - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_wilson_eoq() {
        // EOQ = sqrt(2 * 1000 * 50 / (0.25 * 10)) = sqrt(40000) = 200
        let eoq = wilson_eoq(1000.0, 50.0, 0.25, 10.0);
        assert!((eoq - 200.0).abs() < 1.0);
    }

    #[test]
    fn test_exponential_smoothing() {
        let data = vec![10.0, 12.0, 11.0, 13.0, 15.0];
        let result = exponential_smoothing(&data, 0.3).unwrap();

        assert_eq!(result.len(), data.len());
        assert_eq!(result[0], 10.0);
        assert!(result.iter().all(|x| x.is_finite()));
    }

    #[test]
    fn test_confidence_interval() {
        let forecast = vec![100.0, 110.0, 120.0];
        let residuals = vec![5.0, -5.0, 3.0, -2.0, 1.0];

        let ci = confidence_interval(&forecast, &residuals, 1.96).unwrap();
        assert_eq!(ci.len(), 3);
        assert!(ci.iter().all(|(l, u)| l < u));
    }
}
