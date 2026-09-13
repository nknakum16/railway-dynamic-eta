# Indian Railway Dynamic ETA Prediction & Smart Passenger Assistant

An intelligent full-stack railway information and dynamic delay prediction platform built for Indian Railways passengers. The platform combines real-time train telemetry, domain-informed feature engineering (LightGBM ML), GPS proximity assistants, and an anti-spam smart notification center.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [New Features & Functions](#new-features--functions)
   - [1. User Authentication & Guest Sessions](#1-user-authentication--guest-sessions)
   - [2. In-Train Mode & Smart Destination Filtering](#2-in-train-mode--smart-destination-filtering)
   - [3. Calendarific Festival Factor (ML Feature)](#3-calendarific-festival-factor-ml-feature)
   - [4. Turnaround Effect / Previous Journey Delay (ML Feature)](#4-turnaround-effect--previous-journey-delay-ml-feature)
   - [5. Smart Notification Center & Anti-Spam Engine](#5-smart-notification-center--anti-spam-engine)
3. [Machine Learning Pipeline & Model Evaluation](#machine-learning-pipeline--model-evaluation)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [Frontend Components](#frontend-components)
6. [Setup & Running Instructions](#setup--running-instructions)

---

## Architecture Overview

```
[ React + Vite Frontend ]
       │
       ▼ (REST API calls)
[ FastAPI Backend (Python 3.14) ]
   ├── Auth Service (JWT + Passlib Argon2/Bcrypt)
   ├── SQLite Database (SQLAlchemy: Users, Alarms, WatchedJourneys, Notifications)
   ├── RailRadar Client (Live upstream telemetry with fallback mock generators)
   ├── Festival Service (Calendarific API with yearly disk/memory cache)
   ├── Feature Extractor (19 Predictors: Baseline + Festival + Turnaround)
   ├── LightGBM Model Service (19-Feature Regressor with fallback heuristic)
   └── Smart Notification Service (Anti-spam rate limiter & GPS proximity evaluator)
```

---

## New Features & Functions

### 1. User Authentication & Guest Sessions

- **Module**: `backend/src/api/v1/endpoints/auth.py`, `backend/src/core/security.py`, `frontend/src/components/AuthModal.jsx`
- **Functions**:
  - `POST /api/v1/auth/signup`: Registers a user with full name, unique email, and hashed password.
  - `POST /api/v1/auth/login`: Authenticates user credentials and issues a signed JWT bearer token.
  - `GET /api/v1/auth/me`: Retrieves current authenticated user profile.
  - `getSessionId()`: Automatically creates and persists a guest session token (`railway_session_id`) in browser storage, allowing guest users to set alarms and watch train journeys without requiring mandatory registration.

---

### 2. In-Train Mode & Smart Destination Filtering

- **Module**: `frontend/src/components/InTrainAssistant.jsx`, `frontend/src/components/MyAlarmsModal.jsx`, `backend/src/api/v1/endpoints/journey.py`
- **Functions & Logic**:
  - **In-Train Verification**: Asks passenger if they are currently onboard a train and requests geolocation permission.
  - **Strict Route Filtering**: When the user enters a train number or name:
    1. The system resolves the train's route and current station (`currentLocation.sequence`).
    2. It strictly slices the route: `route.slice(currentIdx + 1)` so that passed/departed stations are completely removed.
    3. The destination dropdown and search only display upcoming stations along that train's actual path.
  - **Proximity Wake-Up Alarm**:
    - Calculates distance to target destination via Haversine GPS formula (`alarm_distance_km`, default: 5 km).
    - Plays synthesized audio tones (`frontend/src/services/alarmAudio.js`) when approaching destination.
    - Saves active alarms to SQLite database (`POST /api/v1/journey/alarm`, `GET /api/v1/journey/alarms`).

---

### 3. Calendarific Festival Factor (ML Feature)

- **Module**: `backend/src/services/festival_service.py`, `backend/src/core/config.py`
- **Purpose**: Indian Railways observes massive delay surges during cultural and national festivals (Diwali, Chhath Puja, Holi, Eid, Dussehra, Republic Day) due to heavy passenger rush and special train scheduling.
- **Functions & Logic**:
  - `get_holidays_for_year(year: int)`: Queries Calendarific API for India (`IN`), with persistent yearly disk cache (`data/festivals/{year}.json`) and memory cache to eliminate redundant network calls.
  - `get_features_for_date(date_str: str)`: Generates 6 numerical features:
    1. `is_festival`: `1` if train departure is within $\pm 3$ days of a festival, else `0`.
    2. `festival_name`: e.g. "Diwali", "Holi", "None".
    3. `festival_importance`: `3` (major gazetted like Diwali/Chhath), `2` (gazetted), `1` (restricted), `0` (none).
    4. `days_to_festival`: Days until the nearest upcoming festival.
    5. `days_from_festival`: Days since the nearest past festival.
    6. `festival_factor`: Continuous proximity score: $\max(0.0, \frac{\text{importance} \times (4 - \text{min\_days})}{4})$.
    7. `historical_festival_delay`: Safe prior delay estimate based on festival factor.
  - **Offline Fallback Catalog**: Built-in gazetted holiday catalog ensures continuous operation even if external API is unreachable or rate-limited.

---

### 4. Turnaround Effect / Previous Journey Delay (ML Feature)

- **Module**: `backend/src/services/feature_extractor.py`, `backend/scripts/compare_models.py`, `backend/scripts/train_sample_model.py`
- **Purpose**: In Indian Railways operations, train rakes are turnaround pairs (e.g. 12951 pairs with 12952 return). Late arrivals on the previous leg or maintenance overruns directly cause secondary delays on the outgoing train.
- **Functions & Logic**:
  - `extract_turnaround_features(live_data)`: Extracts turnaround parameters:
    1. `previous_trip_delay` (min): Delay inherited from incoming rake/origin departure delay (`route[0].delayDeparture`).
    2. `turnaround_time` (min): Scheduled turnaround buffer duration (default 120 min).
    3. `turnaround_delay` (min): Delay component due to turnaround overrun ($\max(0.0, \text{previous\_trip\_delay} - \text{buffer\_absorption})$).
  - **Zero Target Leakage Guarantee**: Turnaround features are derived strictly from origin telemetry or incoming trip arrival, never using downstream station targets.
  - **Dynamic ETA Response Integration**: `turnaroundInfo` is attached to `TrainETAResponse` and displayed in the frontend header badge.

---

### 5. Smart Notification Center & Anti-Spam Engine

- **Module**: `backend/src/services/notification_service.py`, `backend/src/api/v1/endpoints/notification.py`, `frontend/src/components/WatchJourneyModal.jsx`, `frontend/src/components/NotificationCenter.jsx`
- **Purpose**: Allows passengers to "watch" any train journey and receive actionable updates without notification fatigue or repetitive spam.
- **Notification Types & Anti-Spam Triggers**:
  1. **Significant Delay**: Triggers only when delay $\ge$ user threshold (default 15m) AND has increased by $\ge 5$ minutes since the last alert.
  2. **ETA Shift**: Triggers only when destination ETA moves by $\ge \text{eta\_threshold\_mins}$ (default 10m).
  3. **Train Departure**: Triggers once when train departs origin station (`status == 'departed'`).
  4. **Approaching Station**:
     - *With Geolocation*: Checks Haversine distance ($\le 10$ km) from passenger to target stop.
     - *Without Geolocation*: Automatically falls back to train route sequence (1 stop before target) or remaining time ($\le 20$ min).
  5. **Delay Severity Tier Changes**: Notifies on tier transitions:
     - `🟢 On Time` ($\le 5$m)
     - `🟡 Minor Delay` ($5 - 15$m)
     - `🟠 Moderate Delay` ($15 - 45$m)
     - `🔴 Major Delay` ($> 45$m)
  6. **Platform Change**: Alerts if platform changes from a previously known value (never fabricates data).
- **Functions**:
  - `POST /api/v1/notifications/watch`: Saves watch preferences (`delay_threshold_mins`, `eta_threshold_mins`, `notify_approaching`, etc.).
  - `GET /api/v1/notifications/watched`: Lists passenger's active watched trains.
  - `DELETE /api/v1/notifications/watched/{id}`: Cancels a watched train subscription.
  - `GET /api/v1/notifications`: Retrieves notification history with unread count.
  - `PUT /api/v1/notifications/{id}/read`: Marks single notification as read.
  - `PUT /api/v1/notifications/read-all`: Marks all notifications as read.
  - `POST /api/v1/notifications/evaluate`: Evaluator engine that runs background checks and emits new alerts.

---

## Machine Learning Pipeline & Model Evaluation

### Features (19 Predictors)

| Group | Features | Description |
|---|---|---|
| **Baseline (10)** | `curr_delay`, `station_no`, `curr_dist`, `next_station_no`, `next_dist`, `segment_distance`, `day_of_week`, `month`, `is_weekend`, `hist_train_avg_delay` | Spatial, temporal, and historical baseline features |
| **Festival (6)** | `is_festival`, `festival_importance`, `days_to_festival`, `days_from_festival`, `festival_factor`, `historical_festival_delay` | Calendarific Indian festival factors |
| **Turnaround (3)** | `previous_trip_delay`, `turnaround_time`, `turnaround_delay` | Inherited incoming rake turnaround delay |

### Benchmark Results (`scripts/compare_models.py`)

Evaluation on $N=600$ held-out test samples comparing Baseline (10 features) vs Enhanced Model (19 features):

| Metric | Baseline Model | Enhanced Model (Festival + Turnaround) | Improvement |
|---|---|---|---|
| **MAE (Mean Absolute Error)** | `1.9644 min` | **`1.0737 min`** | **+45.34%** |
| **RMSE (Root Mean Squared Error)** | `2.6100 min` | **`1.3218 min`** | **+49.35%** |
| **$R^2$ (Explained Variance)** | `0.3082` | **`0.8226`** | **+166.90%** |

Top features by importance:
1. `curr_delay` (329)
2. `segment_distance` (295)
3. `hist_train_avg_delay` (221)
4. `day_of_week` (160)
5. **`turnaround_delay`** (154)
6. **`festival_factor`** (111)

---

## API Endpoints Reference

### Dynamic ETA & Train Telemetry
- `GET /api/v1/trains/{train_number}/eta`: Primary dynamic ETA endpoint with ML inference, delay trends, festival info, and turnaround metadata.
- `GET /api/v1/trains/{train_number}/live`: Raw live telemetry and station sequence.
- `GET /api/v1/trains/{train_number}/schedule`: Halting station timetable.
- `GET /api/v1/trains/{train_number}/route`: Track GeoJSON coordinates for map visualization.

### ML Inference
- `POST /api/v1/predict/segment`: Single segment additional delay prediction.
- `POST /api/v1/predict/batch`: Direct batch feature inference.

### Smart Notifications
- `POST /api/v1/notifications/watch`: Watch a journey with custom triggers.
- `GET /api/v1/notifications/watched`: List active watched trains.
- `DELETE /api/v1/notifications/watched/{id}`: Unwatch a train.
- `GET /api/v1/notifications`: List notifications and unread badge count.
- `PUT /api/v1/notifications/{id}/read`: Mark notification read.
- `PUT /api/v1/notifications/read-all`: Mark all notifications read.
- `POST /api/v1/notifications/evaluate`: Evaluate watched journeys and generate alerts.

### Journey & Alarms
- `POST /api/v1/journey/alarm`: Save arrival wake-up alarm.
- `GET /api/v1/journey/alarms`: List user's active/past alarms.
- `PUT /api/v1/journey/alarm/{id}/status`: Update alarm state (`active`, `triggered`, `dismissed`).
- `DELETE /api/v1/journey/alarm/{id}`: Delete alarm.

### Authentication
- `POST /api/v1/auth/signup`: User registration.
- `POST /api/v1/auth/login`: User login (returns JWT token).
- `GET /api/v1/auth/me`: Get current user profile.

---

## Frontend Components

| Component | Path | Description |
|---|---|---|
| **`NotificationCenter.jsx`** | `frontend/src/components/` | Slide-out drawer with unread count, severity badges, and Watched Trains tab |
| **`WatchJourneyModal.jsx`** | `frontend/src/components/` | Preference dialog for configuring delay/ETA thresholds and target drop-off stop |
| **`InTrainAssistant.jsx`** | `frontend/src/components/` | Onboard GPS tracker with strict route stop slicing and wake-up alarm setup |
| **`MyAlarmsModal.jsx`** | `frontend/src/components/` | View and manage saved destination alarms |
| **`AuthModal.jsx`** | `frontend/src/components/` | User login and sign-up modal dialog |
| **`LiveTrainStatus.jsx`** | `frontend/src/components/` | Real-time train tracking tab |
| **`TrainSchedule.jsx`** | `frontend/src/components/` | Train timetable and station route lookup |

---

## Setup & Running Instructions

### 1. Backend

```bash
cd railway-backend/backend

# Install dependencies
uv sync

# Initialize database tables
uv run python -c "from src.db.session import init_db; init_db()"

# Train the ML model
uv run python scripts/train_sample_model.py

# Compare baseline vs enhanced models
uv run python scripts/compare_models.py

# Run all backend unit tests (31 tests)
uv run pytest

# Start the FastAPI server
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend

# Install packages
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```
