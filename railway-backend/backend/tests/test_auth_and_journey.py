import uuid
import pytest
from starlette.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_auth_and_journey_flow():
    # 1. Signup unique user
    unique_email = f"passenger_{uuid.uuid4().hex[:8]}@railway.gov.in"
    password = "StrongPassword123!"

    signup_res = client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique_email,
            "full_name": "Rohan Sharma",
            "password": password,
        },
    )
    assert signup_res.status_code == 201, signup_res.text
    signup_data = signup_res.json()
    assert signup_data["success"] is True
    assert "access_token" in signup_data["data"]
    assert signup_data["data"]["user"]["email"] == unique_email
    token = signup_data["data"]["access_token"]

    # 2. Duplicate signup should be rejected
    dup_res = client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique_email,
            "full_name": "Rohan Sharma",
            "password": password,
        },
    )
    assert dup_res.status_code == 400

    # 3. Login with invalid password
    bad_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": unique_email,
            "password": "WrongPassword",
        },
    )
    assert bad_login.status_code == 401

    # 4. Login with correct credentials
    good_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": unique_email,
            "password": password,
        },
    )
    assert good_login.status_code == 200
    login_data = good_login.json()
    assert login_data["success"] is True
    assert "access_token" in login_data["data"]

    # 5. Access protected /me endpoint
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["data"]["email"] == unique_email
    assert me_data["data"]["full_name"] == "Rohan Sharma"

    # 6. Create a journey destination alarm
    alarm_payload = {
        "train_number": "12951",
        "train_name": "Mumbai Rajdhani Express",
        "origin_station": "Mumbai Central",
        "destination_station": "Surat",
        "destination_code": "ST",
        "destination_lat": 21.2049,
        "destination_lon": 72.8411,
        "alarm_distance_km": 5.0,
        "is_in_train": True,
        "initial_user_lat": 19.0760,
        "initial_user_lon": 72.8777,
    }
    alarm_res = client.post("/api/v1/journey/alarm", json=alarm_payload, headers=headers)
    assert alarm_res.status_code == 201, alarm_res.text
    alarm_data = alarm_res.json()
    assert alarm_data["success"] is True
    alarm_id = alarm_data["data"]["id"]
    assert alarm_data["data"]["train_number"] == "12951"
    assert alarm_data["data"]["destination_station"] == "Surat"
    assert alarm_data["data"]["status"] == "active"

    # 7. Fetch user alarms
    list_res = client.get("/api/v1/journey/alarms", headers=headers)
    assert list_res.status_code == 200
    alarms = list_res.json()["data"]
    assert len(alarms) >= 1
    assert any(a["id"] == alarm_id for a in alarms)

    # 8. Update alarm status to triggered
    update_res = client.put(
        f"/api/v1/journey/alarm/{alarm_id}/status",
        json={"status": "triggered"},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["data"]["status"] == "triggered"
    assert update_res.json()["data"]["triggered_at"] is not None

    # 9. Delete alarm
    del_res = client.delete(f"/api/v1/journey/alarm/{alarm_id}", headers=headers)
    assert del_res.status_code == 200
