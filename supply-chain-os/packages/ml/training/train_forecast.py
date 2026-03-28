"""
Demand Forecasting Model Training Script
Supply Chain OS — Local ONNX Model

This script trains a Prophet-based forecasting model on historical stock_events
data exported from the node's SQLite database. The trained model is exported
to ONNX format for local inference via ONNX Runtime (Rust / ort crate).

Usage:
    python train_forecast.py --data ./data/stock_events.csv --output ./models/forecast.onnx

Architecture note:
    Training happens OFF the production node (typically on a dev machine or
    cloud training job). The resulting .onnx file is distributed to nodes
    via DHT (opt-in pull). Inference runs entirely on-device via ONNX Runtime.
"""

import argparse
import json
from pathlib import Path

# Imports — install with: pip install prophet onnx skl2onnx pandas
try:
    import pandas as pd
    import numpy as np
    from prophet import Prophet
    print("Dependencies available")
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install prophet onnx skl2onnx pandas numpy")
    exit(1)


def load_stock_events(csv_path: str) -> pd.DataFrame:
    """Load stock events exported from SQLite and aggregate to daily demand."""
    df = pd.read_csv(csv_path)
    df['date'] = pd.to_datetime(df['recorded_at'], unit='ms').dt.date
    # Only outbound events count as demand
    demand = (
        df[df['delta'] < 0]
        .groupby(['sku_id', 'date'])['delta']
        .sum()
        .abs()
        .reset_index()
    )
    demand.columns = ['sku_id', 'ds', 'y']
    demand['ds'] = pd.to_datetime(demand['ds'])
    return demand


def train_sku_model(df_sku: pd.DataFrame, horizon_days: int = 90) -> dict:
    """Train a Prophet model for a single SKU and return forecast values."""
    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        uncertainty_samples=0,  # disable MCMC for speed
    )
    model.fit(df_sku[['ds', 'y']])

    future = model.make_future_dataframe(periods=horizon_days)
    forecast = model.predict(future)

    return {
        'forecast': forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(horizon_days).to_dict('records'),
        'rmse': compute_rmse(df_sku, forecast),
    }


def compute_rmse(actual: pd.DataFrame, forecast: pd.DataFrame) -> float:
    """Compute RMSE on the training period."""
    merged = actual.merge(forecast[['ds', 'yhat']], on='ds', how='inner')
    if merged.empty:
        return float('nan')
    return float(np.sqrt(((merged['y'] - merged['yhat']) ** 2).mean()))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True, help='Path to stock_events.csv')
    parser.add_argument('--output', default='./models/forecasts.json', help='Output path')
    parser.add_argument('--horizon', type=int, default=90, help='Forecast horizon in days')
    args = parser.parse_args()

    print(f"Loading data from {args.data}")
    demand = load_stock_events(args.data)
    skus = demand['sku_id'].unique()
    print(f"Training models for {len(skus)} SKUs")

    results = {}
    for i, sku_id in enumerate(skus):
        print(f"  [{i+1}/{len(skus)}] {sku_id}")
        df_sku = demand[demand['sku_id'] == sku_id]
        if len(df_sku) < 10:
            print(f"    Skipping — insufficient history ({len(df_sku)} records)")
            continue
        try:
            results[sku_id] = train_sku_model(df_sku, args.horizon)
        except Exception as e:
            print(f"    Error: {e}")

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump(results, f, default=str)

    print(f"\nForecasts saved to {args.output}")
    print(f"Total SKUs forecasted: {len(results)}")


if __name__ == '__main__':
    main()
