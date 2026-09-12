# AI Audit: 02 - API Specification

This document defines the REST API endpoints provided by the backend for frontend integration and ML evaluation.

## Base URL
`/api/v1`

---

## Endpoints

### 1. Health & Status Check
- **Endpoint**: `GET /api/v1/health`
- **Description**: Verifies service status, active ML predictor (trained model vs fallback heuristic), and cache metrics.
- **Response**:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "model": {
    "type": "lightgbm_baseline",
    "loaded": true,
    "model_path": "/home/mv/coding/Hackathon/model/Railway-ETA-Prediction/processed_data/phase3/lightgbm_baseline.pkl"
  },
  "cache_entries": 4
}
```

---

### 2. Dynamic ETA Prediction (Primary Frontend Endpoint)
- **Endpoint**: `GET /api/v1/trains/{train_number}/eta`
- **Query Parameters**:
  - `date` (optional, string): Journey date `YYYY-MM-DD`. Defaults to current run date.
  - `authoritative` (optional, bool): Bypass cache and force upstream refresh (default: `false`).
- **Description**: Fetches live telemetry, extracts features for all upcoming stations, runs LightGBM model inference, and returns enriched route with scheduled vs predicted arrival/departure, predicted delay, and delay trends.
- **Response Summary**:
```json
{
  "success": true,
  "data": {
    "train_number": "12919",
    "train_name": "Malwa SF Express",
    "start_date": "2026-06-22",
    "status": "running",
    "overall_delay_minutes": 12.0,
    "current_location": {
      "station_code": "UJN",
      "sequence": 2,
      "status": "departed",
      "speed_kmh": 65.5,
      "segment_progress": 0.45
    },
    "model_used": "lightgbm_baseline",
    "route": [
      {
        "sequence": 1,
        "station_code": "INDB",
        "station_name": "Indore Junction",
        "status": "departed",
        "distance": 0,
        "scheduled_arrival": null,
        "scheduled_departure": "2026-06-22T23:55:00+05:30",
        "actual_departure": "2026-06-23T00:07:00+05:30",
        "predicted_arrival": null,
        "predicted_departure": "2026-06-23T00:07:00+05:30",
        "predicted_delay_minutes": 12.0,
        "delay_trend": "stable"
      },
      {
        "sequence": 2,
        "station_code": "UJN",
        "station_name": "Ujjain Junction",
        "status": "departed",
        "distance": 55,
        "scheduled_arrival": "2026-06-23T00:55:00+05:30",
        "actual_arrival": "2026-06-23T01:07:00+05:30",
        "predicted_arrival": "2026-06-23T01:07:00+05:30",
        "predicted_delay_minutes": 12.0,
        "delay_trend": "stable"
      },
      {
        "sequence": 3,
        "station_code": "MKSM",
        "station_name": "Maksi",
        "status": "upcoming",
        "distance": 96,
        "scheduled_arrival": "2026-06-23T01:45:00+05:30",
        "scheduled_departure": "2026-06-23T01:47:00+05:30",
        "actual_arrival": null,
        "predicted_arrival": "2026-06-23T01:59:00+05:30",
        "predicted_departure": "2026-06-23T02:01:00+05:30",
        "predicted_delay_minutes": 14.0,
        "delay_trend": "increasing"
      }
    ]
  }
}
```

---

### 3. Single Segment Additional Delay Prediction
- **Endpoint**: `POST /api/v1/predict/segment`
- **Description**: Dedicated endpoint executing the LightGBM baseline model on a single station segment with input validation and optional ETA synthesis.
- **Request Body**:
```json
{
  "features": {
    "curr_delay": 13.0,
    "station_no": 2,
    "curr_dist": 39.0,
    "next_station_no": 3,
    "next_dist": 79.0,
    "segment_distance": 40.0,
    "day_of_week": 1,
    "month": 6,
    "is_weekend": 0,
    "hist_train_avg_delay": 15.0
  },
  "scheduledArrivalNext": "2026-09-12T12:45:00+05:30"
}
```
- **Response**:
```json
{
  "predicted_additional_delay_minutes": 4.25,
  "current_delay_minutes": 13.0,
  "predicted_eta": "2026-09-12T13:02:15+05:30",
  "model": "lightgbm_baseline",
  "model_artifact": "/home/mv/coding/Hackathon/model/Railway-ETA-Prediction/processed_data/phase3/lightgbm_baseline.pkl"
}
```

---

### 4. Raw ML Feature Batch Prediction
- **Endpoint**: `POST /api/v1/predict/batch`
- **Description**: Direct batch inference returning clamped non-negative additional delay predictions.
- **Request Body**:
```json
{
  "features": [
    {
      "curr_delay": 15.0,
      "station_no": 2,
      "curr_dist": 55.0,
      "next_station_no": 3,
      "next_dist": 96.0,
      "segment_distance": 41.0,
      "day_of_week": 0,
      "month": 6,
      "is_weekend": 0,
      "hist_train_avg_delay": 12.0
    }
  ]
}
```
- **Response**:
```json
{
  "success": true,
  "data": {
    "predictions": [4.03],
    "model_used": "lightgbm_baseline"
  }
}
```

---

### 5. Live Train Telemetry & Status
- **Endpoint**: `GET /api/v1/trains/{train_number}/live`
- **Query Parameters**: `date`, `authoritative`, `halts_only`

---

### 6. Train Schedule & Timetable
- **Endpoint**: `GET /api/v1/trains/{train_number}/schedule`
- **Query Parameters**: `halts_only`

---

### 7. Train Track Geometry (GIS)
- **Endpoint**: `GET /api/v1/trains/{train_number}/route`
- **Query Parameters**: `format` (`geojson` | `polyline` | `coordinates`), `stops`
