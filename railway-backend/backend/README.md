# Dynamic ETA Predictor for Indian Railways - Backend

FastAPI backend for the Dynamic ETA Predictor project. It serves as the orchestrator between the web/mobile frontend, live Indian Railways telemetry (RailRadar API), and Machine Learning models predicting real-time arrival and departure delays.

---

## Architecture Overview

```
Frontend ──▶ FastAPI (/api/v1) ──▶ Feature Extractor (10 Predictors) ──▶ ML Model ──▶ Dynamic ETA
                  │
                  ├──▶ In-Memory TTL Cache (Protects 1,000 req/month quota)
                  └──▶ Upstream RailRadar Client (with realistic offline mock fallback)
```

For detailed architectural and audit docs, see the [ai_audit/](file:///home/mv/coding/Hackathon/backend/ai_audit/) folder:
- [00_architecture_overview.md](file:///home/mv/coding/Hackathon/backend/ai_audit/00_architecture_overview.md)
- [01_features_and_model_contract.md](file:///home/mv/coding/Hackathon/backend/ai_audit/01_features_and_model_contract.md)
- [02_api_specification.md](file:///home/mv/coding/Hackathon/backend/ai_audit/02_api_specification.md)
- [03_execution_audit.md](file:///home/mv/coding/Hackathon/backend/ai_audit/03_execution_audit.md)

---

## Getting Started

### 1. Install Dependencies
This project uses `uv` for fast, reproducible dependency management:
```bash
uv sync
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Key configuration settings:
- `RAILRADAR_API_KEY`: Your RailRadar API token.
- `ENABLE_MOCK_FALLBACK`: Set to `true` to ensure the API never fails if rate-limited or offline during the hackathon pitch.
- `MODEL_PATH`: Path to your trained model file (`models/eta_model.joblib`).

### 3. Run the Development Server
```bash
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Interactive API Documentation
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## Primary API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health, model status, and cache metrics |
| `GET` | `/api/v1/trains/{train_number}/eta` | **Primary Dynamic ETA Endpoint**: Synthesizes live status, upcoming stations, ML delay predictions, and delay trends |
| `GET` | `/api/v1/trains/{train_number}/live` | Live telemetry, location, and speed |
| `GET` | `/api/v1/trains/{train_number}/schedule` | Train timetable and halting stops |
| `GET` | `/api/v1/trains/{train_number}/route` | GeoJSON track geometry for map rendering |
| `POST` | `/api/v1/predict/batch` | Direct feature inference endpoint for ML evaluation |

---

## Machine Learning Integration

The model interface in [model_service.py](file:///home/mv/coding/Hackathon/backend/src/services/model_service.py) accepts feature vectors corresponding to the 10 predictors in `docs/model/predictors.txt`:
1. `curr_delay` (float)
2. `station_no` (int)
3. `curr_dist` (float)
4. `next_station_no` (int)
5. `next_dist` (float)
6. `segment_distance` (float)
7. `day_of_week` (int)
8. `month` (int)
9. `is_weekend` (int)
10. `hist_train_avg_delay` (float)

To update the model:
1. Place your trained model file in `models/eta_model.joblib` (or `.pkl`).
2. The service loads it automatically. If no trained model is present, the built-in `HeuristicFallbackPredictor` seamlessly runs so development and demos are never blocked.

---

## Running Tests

Run the complete test suite:
```bash
uv run pytest -v
```
