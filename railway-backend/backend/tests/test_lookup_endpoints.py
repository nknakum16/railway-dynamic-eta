import pytest
from starlette.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_popular_trains_endpoint():
    response = client.get("/api/v1/lookup/trains/popular")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert isinstance(json_data["data"], list)
    assert len(json_data["data"]) > 0
    first = json_data["data"][0]
    assert "number" in first
    assert "name" in first
    assert '{"success"' not in first["number"]
    assert '"data"' not in first["number"]
    assert first["number"].isdigit()


def test_search_trains_endpoint():
    response = client.get("/api/v1/lookup/search/trains?q=Rajdhani")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert isinstance(json_data["data"], list)


def test_search_stations_endpoint():
    response = client.get("/api/v1/lookup/search/stations?q=Indore")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert isinstance(json_data["data"], list)
    assert len(json_data["data"]) > 0


def test_trains_between_endpoint():
    response = client.get("/api/v1/trains/between?from=INDB&to=NDLS")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "data" in json_data
