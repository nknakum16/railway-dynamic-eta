import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from src.schemas.prediction import (
    ALL_FEATURES,
    FEATURES,
    FESTIVAL_FEATURES,
    TURNAROUND_FEATURES,
    WEATHER_FEATURES,
)


def run_model_comparison() -> None:
    print("=" * 78)
    print(" Indian Railway Dynamic ETA Prediction System: Progressive Model Comparison")
    print(" Evaluating Models 1 through 4 (Baseline -> Festival -> Turnaround -> Weather)")
    print("=" * 78)

    np.random.seed(42)
    n_samples = 3000

    curr_delay = np.random.uniform(0, 60, size=(n_samples, 1))
    station_no = np.random.randint(1, 10, size=(n_samples, 1))
    curr_dist = station_no * np.random.uniform(30, 80, size=(n_samples, 1))
    next_station_no = station_no + np.random.randint(1, 5, size=(n_samples, 1))
    next_dist = curr_dist + np.random.uniform(20, 200, size=(n_samples, 1))
    segment_distance = next_dist - curr_dist
    day_of_week = np.random.randint(0, 7, size=(n_samples, 1))
    month = np.random.randint(1, 13, size=(n_samples, 1))
    is_weekend = (day_of_week >= 5).astype(float)
    hist_avg = np.random.uniform(5, 30, size=(n_samples, 1))

    # Festival features
    is_festival = (np.random.rand(n_samples, 1) < 0.18).astype(float)
    festival_importance = is_festival * np.random.choice([1.0, 2.0, 3.0], size=(n_samples, 1), p=[0.2, 0.3, 0.5])
    days_to_festival = np.where(is_festival == 1, np.random.uniform(0, 3, size=(n_samples, 1)), np.random.uniform(4, 45, size=(n_samples, 1)))
    days_from_festival = np.where(is_festival == 1, np.random.uniform(0, 3, size=(n_samples, 1)), np.random.uniform(4, 45, size=(n_samples, 1)))
    decay = np.maximum(0.0, (4.0 - np.minimum(days_to_festival, days_from_festival)) / 4.0)
    festival_factor = np.round(festival_importance * decay, 2)
    historical_festival_delay = np.round(15.0 * (festival_factor / 3.0), 2)

    # Turnaround features
    has_prev_delay = (np.random.rand(n_samples, 1) < 0.35).astype(float)
    previous_trip_delay = np.round(has_prev_delay * np.random.exponential(scale=18.0, size=(n_samples, 1)), 1)
    turnaround_time = np.random.choice([90.0, 120.0, 150.0, 180.0], size=(n_samples, 1), p=[0.2, 0.5, 0.2, 0.1])
    turnaround_delay = np.maximum(0.0, np.round(previous_trip_delay - np.maximum(0.0, (turnaround_time - 100.0) * 0.3), 1))

    # Weather features (Open-Meteo variables)
    is_monsoon_or_rain = (np.random.rand(n_samples, 1) < 0.22).astype(float)
    rain_mm = np.round(is_monsoon_or_rain * np.random.exponential(scale=8.0, size=(n_samples, 1)), 1)
    wind_speed_kmh = np.round(np.random.uniform(5.0, 35.0, size=(n_samples, 1)) + (is_monsoon_or_rain * np.random.uniform(0, 25.0, size=(n_samples, 1))), 1)
    is_winter_month = np.isin(month, [11, 12, 1, 2]).astype(float)
    has_fog = (is_winter_month * (np.random.rand(n_samples, 1) < 0.30)).astype(float)
    visibility_m = np.where(has_fog == 1, np.random.uniform(200.0, 1500.0, size=(n_samples, 1)), np.random.uniform(5000.0, 10000.0, size=(n_samples, 1)))

    is_heavy_rain = (rain_mm >= 15.0).astype(float)
    is_low_visibility = (visibility_m < 1000.0).astype(float)
    is_strong_wind = (wind_speed_kmh >= 40.0).astype(float)

    weather_severity = np.zeros((n_samples, 1))
    weather_severity = np.where((rain_mm >= 1.0) | (wind_speed_kmh >= 22.0) | (visibility_m < 5000.0), 1.0, weather_severity)
    weather_severity = np.where((rain_mm >= 8.0) | (wind_speed_kmh >= 30.0) | (visibility_m < 2500.0), 2.0, weather_severity)
    weather_severity = np.where((is_heavy_rain == 1) | (is_low_visibility == 1) | (wind_speed_kmh >= 50.0), 3.0, weather_severity)

    data_matrix = np.hstack([
        curr_delay,
        station_no,
        curr_dist,
        next_station_no,
        next_dist,
        segment_distance,
        day_of_week,
        month,
        is_weekend,
        hist_avg,
        is_festival,
        festival_importance,
        days_to_festival,
        days_from_festival,
        festival_factor,
        historical_festival_delay,
        previous_trip_delay,
        turnaround_time,
        turnaround_delay,
        weather_severity,
        rain_mm,
        wind_speed_kmh,
        visibility_m,
        is_heavy_rain,
        is_low_visibility,
        is_strong_wind,
    ])

    df = pd.DataFrame(data_matrix, columns=ALL_FEATURES)

    # Realistic Ground truth target: operational delay accumulation across railway bottlenecks
    y = (
        0.05 * curr_delay.ravel()
        + 0.02 * segment_distance.ravel()
        + 1.5 * is_weekend.ravel()
        + 2.8 * festival_factor.ravel()
        + 0.08 * turnaround_delay.ravel()
        + 1.8 * weather_severity.ravel()
        + 0.15 * hist_avg.ravel()
        + np.random.normal(0, 1.0, size=n_samples)
    )
    y = np.maximum(0.0, y)

    # 80/20 Train-Test split
    X_train, X_test, y_train, y_test = train_test_split(df, y, test_size=0.2, random_state=42)

    # Feature sets for Models 1, 2, 3, 4
    feats_m1 = FEATURES  # 10
    feats_m2 = FEATURES + FESTIVAL_FEATURES  # 16
    feats_m3 = FEATURES + FESTIVAL_FEATURES + TURNAROUND_FEATURES  # 19
    feats_m4 = ALL_FEATURES  # 26

    def evaluate(feats, name):
        m = lgb.LGBMRegressor(n_estimators=50, max_depth=6, learning_rate=0.05, random_state=42, verbose=-1)
        m.fit(X_train[feats], y_train)
        pred = np.maximum(0.0, m.predict(X_test[feats]))
        mae = mean_absolute_error(y_test, pred)
        rmse = root_mean_squared_error(y_test, pred)
        r2 = r2_score(y_test, pred)
        return m, mae, rmse, r2

    m1, mae1, rmse1, r21 = evaluate(feats_m1, "Model 1")
    m2, mae2, rmse2, r22 = evaluate(feats_m2, "Model 2")
    m3, mae3, rmse3, r23 = evaluate(feats_m3, "Model 3")
    m4, mae4, rmse4, r24 = evaluate(feats_m4, "Model 4")

    print(f"\nEvaluation Results on Test Set (N=600 samples):")
    print("-" * 78)
    print(f"{'Model Configuration':<40} | {'MAE (min)':<10} | {'RMSE (min)':<10} | {'R^2':<8}")
    print("-" * 78)
    print(f"{'Model 1: Baseline (10 Feats)':<40} | {mae1:<10.4f} | {rmse1:<10.4f} | {r21:<8.4f}")
    print(f"{'Model 2: + Festival Factor (16 Feats)':<40} | {mae2:<10.4f} | {rmse2:<10.4f} | {r22:<8.4f}")
    print(f"{'Model 3: + Turnaround Effect (19 Feats)':<40} | {mae3:<10.4f} | {rmse3:<10.4f} | {r23:<8.4f}")
    print(f"{'Model 4: + Open-Meteo Weather (26 Feats)':<40} | {mae4:<10.4f} | {rmse4:<10.4f} | {r24:<8.4f}")
    print("-" * 78)
    print(f"Overall MAE Improvement (Model 1 -> Model 4): {((mae1 - mae4)/mae1)*100:+.2f}%")
    print(f"Overall R^2 Improvement  (Model 1 -> Model 4): {((r24 - r21)/max(abs(r21), 1e-6))*100:+.2f}%")
    print("-" * 78)

    print("\nTop 8 Feature Importances in Full Model 4:")
    importances = m4.feature_importances_
    feat_imp = sorted(zip(ALL_FEATURES, importances), key=lambda x: x[1], reverse=True)
    for name, imp in feat_imp[:8]:
        print(f"  - {name:<26}: {imp}")
    print("=" * 78)


if __name__ == "__main__":
    run_model_comparison()
