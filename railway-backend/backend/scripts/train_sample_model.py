"""Helper script to train and export a sample ML model artifact for testing and development."""

import os
import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor


def train_and_save_sample_model(output_path: str = "models/eta_model.joblib") -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # 10 predictors:
    # 0: curr_delay
    # 1: station_no
    # 2: curr_dist
    # 3: next_station_no
    # 4: next_dist
    # 5: segment_distance
    # 6: day_of_week
    # 7: month
    # 8: is_weekend
    # 9: hist_train_avg_delay
    print("Generating synthetic training data matching predictors.txt...")
    np.random.seed(42)
    n_samples = 1000

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

    x_train = np.hstack([
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
    ])

    # Target: predicted delay at next station with some noise and distance drift
    y_train = (
        0.8 * curr_delay.ravel()
        + 0.02 * segment_distance.ravel()
        + 1.5 * is_weekend.ravel()
        + 0.2 * hist_avg.ravel()
        + np.random.normal(0, 2.0, size=n_samples)
    )
    y_train = np.maximum(0.0, y_train)

    print("Fitting sample RandomForestRegressor...")
    model = RandomForestRegressor(n_estimators=20, max_depth=6, random_state=42)
    model.fit(x_train, y_train)

    joblib.dump(model, output_path)
    print(f"Model successfully saved to {output_path}!")


if __name__ == "__main__":
    train_and_save_sample_model()
