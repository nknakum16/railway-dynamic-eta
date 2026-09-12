import pytest
from starlette.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "docs" in data


def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"]["status"] == "healthy"
    assert "model" in json_data["data"]
    assert json_data["data"]["model"]["loaded"] is True


def test_live_train_status_endpoint():
    response = client.get("/api/v1/trains/12919/live")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    data = json_data["data"]
    assert data["trainNumber"] == "12919"
    assert "currentLocation" in data
    assert "route" in data
    assert len(data["route"]) > 0


def test_train_schedule_endpoint():
    response = client.get("/api/v1/trains/12919/schedule")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    data = json_data["data"]
    assert "train" in data
    assert "route" in data


def test_train_route_geometry_endpoint():
    response = client.get("/api/v1/trains/12919/route?format=geojson")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    data = json_data["data"]
    assert data["trainNumber"] == "12919"
    assert data["format"] == "geojson"
    assert "geojson" in data
    assert "stops" in data


def test_dynamic_eta_endpoint():
    response = client.get("/api/v1/trains/12919/eta")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    data = json_data["data"]
    assert data["trainNumber"] == "12919"
    assert "overallDelayMinutes" in data
    assert "currentLocation" in data
    assert "modelUsed" in data
    assert "route" in data

    # Check upcoming stops have predicted arrivals
    upcoming_found = False
    for stop in data["route"]:
        if stop["status"] == "upcoming":
            upcoming_found = True
            assert stop["predictedArrival"] is not None
            assert stop["predictedDelayMinutes"] >= 0.0
            assert stop["delayTrend"] in ("improving", "increasing", "stable")
    assert upcoming_found


def test_predict_segment_endpoint():
    payload = {
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
            "hist_train_avg_delay": 15.0,
        },
        "scheduledArrivalNext": "2026-09-12T12:00:00+05:30",
    }
    response = client.post("/api/v1/predict/segment", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "predicted_additional_delay_minutes" in data
    assert data["predicted_additional_delay_minutes"] >= 0.0
    assert data["current_delay_minutes"] == 13.0
    assert data["predicted_eta"] is not None
    assert "lightgbm_1m" in data["model"]
    assert "lightgbm_1m.pkl" in data["model_artifact"]


def test_predict_segment_missing_features_error():
    payload = {
        "features": {
            "curr_delay": 13.0,
            # missing rest of the 9 features
        }
    }
    response = client.post("/api/v1/predict/segment", json=payload)
    assert response.status_code == 422  # Pydantic validation error


def test_predict_batch_endpoint():
    payload = {
        "features": [
            {
                "curr_delay": 15.0,
                "station_no": 2,
                "curr_dist": 40.0,
                "next_station_no": 3,
                "next_dist": 80.0,
                "segment_distance": 40.0,
                "day_of_week": 1,
                "month": 6,
                "is_weekend": 0,
                "hist_train_avg_delay": 15.0,
            }
        ]
    }
    response = client.post("/api/v1/predict/batch", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert len(json_data["data"]["predictions"]) == 1
    assert isinstance(json_data["data"]["predictions"][0], float)
    assert json_data["data"]["predictions"][0] >= 0.0
