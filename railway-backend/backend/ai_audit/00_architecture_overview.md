# AI Audit: 00 - Architecture Overview

## Project: Dynamic Indian Railways ETA Predictor Backend

### 1. Executive Summary
The backend acts as the central intelligence engine that:
1. Ingests live telemetry & route schedule data from the RailRadar API.
2. Extracts engineering features specified in `docs/model/predictors.txt`.
3. Passes these features into a machine learning model service to predict real-time arrival/departure delay.
4. Synthesizes schedule times, actual status, and predicted ETAs into a clean, normalized JSON API consumed by the web/mobile frontend.

### 2. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (Web / Mobile)               │
└──────────────┬───────────────────────────────▲──────────────┘
               │ HTTP GET /trains/{id}/eta     │ JSON Response
               ▼                               │
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                      │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               API Routers & Endpoints               │   │
│   │   - /trains/{id}/live                               │   │
│   │   - /trains/{id}/schedule                           │   │
│   │   - /trains/{id}/route                              │   │
│   │   - /trains/{id}/eta   (Dynamic ETA core)           │   │
│   │   - /predict/batch     (Direct ML inference)        │   │
│   │   - /health                                         │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │                   Services Layer                    │   │
│   │                                                     │   │
│   │  ┌────────────────────┐     ┌─────────────────────┐ │   │
│   │  │  RailRadar Client  │     │  Feature Extractor  │ │   │
│   │  │  (Async + TTL Cache│────▶│  (10 Predictors)    │ │   │
│   │  │   + Mock Fallback) │     └──────────┬──────────┘ │   │
│   │  └────────────────────┘                │            │   │
│   │                                        ▼            │   │
│   │                             ┌─────────────────────┐ │   │
│   │                             │    Model Service    │ │   │
│   │                             │  - Joblib/PKL Model │ │   │
│   │                             │  - Baseline Model   │ │   │
│   │                             └──────────┬──────────┘ │   │
│   │                                        │            │   │
│   │  ┌─────────────────────────────────────▼──────────┐ │   │
│   │  │                   ETA Service                  │ │   │
│   │  │  (Synthesizes Timetable + Predictions into ETA)│ │   │
│   │  └────────────────────────────────────────────────┘ │   │
│   └─────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼ Upstream
            ┌────────────────────────────────────┐
            │   RailRadar API (Telemetry/Route)  │
            └────────────────────────────────────┘
```

### 3. Key Design Decisions & Modularity

1. **Layered Separation of Concerns**:
   - **`src/core/`**: Configuration via Pydantic BaseSettings, in-memory TTL caching, and logging.
   - **`src/schemas/`**: Pydantic v2 schemas providing strict typing, input validation, and auto-generated OpenAPI documentation.
   - **`src/services/`**: Pure business logic separated from HTTP transport.
     - `railradar_client.py`: Handles HTTP communication, caching, headers, and offline mock fallback.
     - `feature_extractor.py`: Extracts and transforms live data into the 10 features defined in `predictors.txt`.
     - `model_service.py`: Encapsulates ML inference. Decoupled via `BasePredictor` interface.
     - `eta_service.py`: Combines telemetry, schedule, and model inferences into dynamic ETAs.
   - **`src/api/`**: Dependency injection, routing, parameter parsing, and HTTP status codes.

2. **Resilience & Quota Preservation**:
   - RailRadar free tier has a 1,000 req/month quota.
   - In-memory async TTL cache buffers repeat requests for live status (30s) and static schedules (1hr).
   - Mock data fallback activates if upstream is unreachable or rate-limited, preventing demo failures.

3. **Pluggable ML Integration**:
   - The ML team can drop their trained model (e.g. `model.joblib`) into `models/`.
   - If missing, the service seamlessly falls back to a realistic baseline heuristic without throwing 500 errors.
