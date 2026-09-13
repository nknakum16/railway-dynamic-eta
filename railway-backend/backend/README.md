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
| `GET` | `/api/v1/trains/{train_number}/eta` | **Primary Dynamic ETA Endpoint**: Synthesizes live status, upcoming stations, ML delay predictions, festival factor, turnaround impact, and delay trends |
| `GET` | `/api/v1/trains/{train_number}/live` | Live telemetry, location, and speed |
| `GET` | `/api/v1/trains/{train_number}/schedule` | Train timetable and halting stops |
| `GET` | `/api/v1/trains/{train_number}/route` | GeoJSON track geometry for map rendering |
| `POST` | `/api/v1/predict/segment` | Single segment delay prediction with ETA calculation |
| `POST` | `/api/v1/predict/batch` | Direct feature inference endpoint for ML evaluation |
| `POST` | `/api/v1/notifications/watch` | Watch a train journey with passenger alert preferences |
| `GET` | `/api/v1/notifications/watched` | List passenger's active watched trains |
| `DELETE` | `/api/v1/notifications/watched/{id}` | Unwatch a train journey |
| `GET` | `/api/v1/notifications` | Fetch notification history and unread badge count |
| `PUT` | `/api/v1/notifications/read-all` | Mark all notifications as read |
| `POST` | `/api/v1/notifications/evaluate` | Smart anti-spam evaluator for delay/ETA/proximity alerts |
| `POST` | `/api/v1/journey/alarm` | Create GPS arrival wake-up alarm |
| `GET` | `/api/v1/journey/alarms` | List user's active/past alarms |
| `POST` | `/api/v1/auth/signup` | Register new user account |
| `POST` | `/api/v1/auth/login` | Authenticate user and receive JWT access token |

---

## Machine Learning Integration

The model interface in [model_service.py](file:///d:/railway-project/railway-backend/backend/src/services/model_service.py) accepts feature vectors corresponding to all 19 predictors:

### 1. Baseline Features (10)
1. `curr_delay`: Current train delay (minutes)
2. `station_no`: Current station sequence number
3. `curr_dist`: Cumulative distance at current station (km)
4. `next_station_no`: Next station sequence number
5. `next_dist`: Cumulative distance at next station (km)
6. `segment_distance`: Distance between current and next station (km)
7. `day_of_week`: 0=Monday, 6=Sunday
8. `month`: 1-12
9. `is_weekend`: 1 if Saturday/Sunday else 0
10. `hist_train_avg_delay`: Historical average delay of this train

### 2. Calendarific Festival Features (6)
11. `is_festival`: 1 if journey is within festival window ($\pm 3$ days) else 0
12. `festival_importance`: 0.0 to 3.0
13. `days_to_festival`: Days until nearest upcoming festival
14. `days_from_festival`: Days since nearest past festival
15. `festival_factor`: Continuous proximity impact factor
16. `historical_festival_delay`: Estimated festival rush delay

### 3. Turnaround / Previous Journey Features (3)
17. `previous_trip_delay`: Delay inherited from incoming rake/origin departure
18. `turnaround_time`: Scheduled turnaround buffer duration (minutes)
19. `turnaround_delay`: Unabsorbed turnaround overrun delay

### Model Evaluation & Comparison

Compare baseline (10 features) vs enhanced (19 features) models:
```bash
uv run python scripts/compare_models.py
```

Train and update the serialized model:
```bash
uv run python scripts/train_sample_model.py
```

---

## Running Tests

Run the complete test suite (31 tests):
```bash
uv run pytest -v
```

