# AI Audit: 01 - Features and Model Contract

## Predictor Features Specification
Derived from `docs/model/predictors.txt` and verified with `processed_data/phase3/feature_list.json`, the feature vector for predicting delay at any upcoming station requires 10 distinct features in this exact order:

| Index | Feature Name | Type | Description | Source / Derivation |
|---|---|---|---|---|
| 0 | `curr_delay` | float | Current train delay (minutes) | Upstream live telemetry (`delayMinutes` or current halt delay) |
| 1 | `station_no` | int | Current station sequence | Current station sequence in the route (`currentLocation.sequence`) |
| 2 | `curr_dist` | float | Distance at current station (km) | Route cumulative distance at `station_no` |
| 3 | `next_station_no` | int | Target upcoming station sequence | Route sequence of target station |
| 4 | `next_dist` | float | Distance at target station (km) | Route cumulative distance at `next_station_no` |
| 5 | `segment_distance` | float | Distance between stations (km) | `max(0.0, next_dist - curr_dist)` |
| 6 | `day_of_week` | int | Day of week | Journey date day of week (0=Monday, 6=Sunday) |
| 7 | `month` | int | Month of year | Journey date month (1=January, 12=December) |
| 8 | `is_weekend` | int | Weekend indicator | `1` if day_of_week >= 5 (Sat/Sun) else `0` |
| 9 | `hist_train_avg_delay` | float | Historical avg delay (min) | Train historical statistic (or fallback average e.g. 15.0 min) |

### Calendarific Festival Extension Features
Derived via `src/services/festival_service.py` using Calendarific API for India (`IN`):

| Index | Feature Name | Type | Description | Source / Derivation |
|---|---|---|---|---|
| 10 | `is_festival` | int | Binary festival indicator | `1` if journey date is within ±3 days of Indian festival, else `0` |
| 11 | `festival_importance` | float | Festival weight | 3.0 (Major e.g. Diwali/Holi/Chhath), 2.0 (Gazetted), 1.0 (Restricted) |
| 12 | `days_to_festival` | float | Days to upcoming festival | Minimum days until next holiday |
| 13 | `days_from_festival` | float | Days from past festival | Minimum days since previous holiday |
| 14 | `festival_factor` | float | Scaled proximity score | Continuous factor peaking on festival day and decaying over window |
| 15 | `historical_festival_delay`| float | Expected delay surge (min) | Fixed training prior buffer, avoiding target leakage |

---

## Machine Learning Interface Contract: LightGBM Baseline Model

### 1. Model Artifact Specifications
- **File Location**: `/home/mv/coding/Hackathon/model/Railway-ETA-Prediction/processed_data/phase3/lightgbm_baseline.pkl`
- **Serialization**: Loaded with `joblib.load()` (not standard pickle)
- **Model Type**: `lightgbm.sklearn.LGBMRegressor`
- **Parameters**: 500 trees, learning rate 0.05, 31 leaves, GBDT objective
- **Fitted Features**: Exactly 10 columns matching `FEATURES`

### 2. Input Dataframe Contract
The LightGBM scikit-learn wrapper requires a `pandas.DataFrame` with named columns in the exact order:
```python
FEATURES = [
    "curr_delay",
    "station_no",
    "curr_dist",
    "next_station_no",
    "next_dist",
    "segment_distance",
    "day_of_week",
    "month",
    "is_weekend",
    "hist_train_avg_delay",
]
```
Input validation guarantees:
- All 10 fields must be present; no silent defaults or missing fields are tolerated.
- Values must be numeric and non-null (no `NaN` or `None`).

### 3. Target Definition & Prediction Meaning
The model predicts **`additional_delay`**:
$$\text{additional\_delay} = \text{delay\_at\_next\_station} - \text{delay\_at\_current\_station}$$
Target unit: **minutes**.

### 4. Live ETA Calculation & Clamping
Raw model output may be negative (indicating predicted delay recovery).
For production ETA calculation, negative values are clamped to zero:
$$\text{predicted\_additional\_delay} = \max(0.0, \text{raw\_model\_prediction})$$

The final dynamic arrival time (ETA) is computed as:
$$\text{Predicted ETA} = \text{Scheduled Arrival (next station)} + \text{Current Delay} + \text{Predicted Additional Delay}$$

And for the full route sequence:
$$\text{Station Total Delay} = \text{curr\_delay} + \text{predicted\_additional\_delay}$$

### 5. Lifecycle & Concurrency
- Loaded once during application startup in `lifespan`.
- Thread-safe read operations via singleton `ModelManager`.
- No per-request disk reloading.
