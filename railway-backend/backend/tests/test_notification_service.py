import pytest
from starlette.testclient import TestClient
from src.main import app
from src.db.session import SessionLocal
from src.schemas.notification import WatchJourneyRequest, WatchPreferences
from src.services.notification_service import notification_service, haversine_distance_km, get_severity_tier


@pytest.fixture
def db_session():
    session = SessionLocal()
    yield session
    session.close()


def test_haversine_and_severity_helpers():
    # Mumbai Central (18.9696, 72.8193) to Surat (21.2049, 72.8411) ~ 248 km
    dist = haversine_distance_km(18.9696, 72.8193, 21.2049, 72.8411)
    assert 240.0 < dist < 260.0

    assert get_severity_tier(3.0) == "on_time"
    assert get_severity_tier(10.0) == "minor"
    assert get_severity_tier(30.0) == "moderate"
    assert get_severity_tier(60.0) == "major"


def test_watch_and_anti_spam_flow(db_session):
    session_id = "test_session_123"
    req = WatchJourneyRequest(
        train_number="12951",
        train_name="Mumbai Rajdhani Express",
        origin_station="Mumbai Central",
        destination_station="New Delhi",
        target_station_code="NDLS",
        target_station_name="New Delhi",
        session_id=session_id,
        preferences=WatchPreferences(
            notify_significant_delay=True,
            delay_threshold_mins=15,
            notify_eta_changed=True,
            eta_threshold_mins=10,
        ),
    )

    watched = notification_service.watch_journey(db_session, req)
    assert watched.train_number == "12951"
    assert watched.is_active is True

    # Check notification summary
    summary = notification_service.get_notifications(db_session, session_id=session_id)
    assert summary.unread_count >= 1
    assert any("Watching Journey" in n.title for n in summary.notifications)

    # Mark as read
    notif_id = summary.notifications[0].id
    marked = notification_service.mark_as_read(db_session, notif_id, session_id=session_id)
    assert marked is True

    # Unwatch
    unwatched = notification_service.unwatch_journey(db_session, watched.id, session_id=session_id)
    assert unwatched is True


def test_notification_endpoints():
    client = TestClient(app)

    # 1. Watch journey
    watch_res = client.post(
        "/api/v1/notifications/watch",
        json={
            "train_number": "12919",
            "train_name": "Malwa Express",
            "session_id": "api_test_session_456",
            "preferences": {
                "notify_significant_delay": True,
                "delay_threshold_mins": 15,
            },
        },
    )
    assert watch_res.status_code == 200
    watch_data = watch_res.json()
    assert watch_data["success"] is True
    assert watch_data["data"]["train_number"] == "12919"
    watched_id = watch_data["data"]["id"]

    # 2. Get watched journeys
    list_res = client.get("/api/v1/notifications/watched?session_id=api_test_session_456")
    assert list_res.status_code == 200
    assert len(list_res.json()["data"]) >= 1

    # 3. Get notification history
    notifs_res = client.get("/api/v1/notifications?session_id=api_test_session_456")
    assert notifs_res.status_code == 200
    summary = notifs_res.json()["data"]
    assert summary["unread_count"] >= 1

    # 4. Evaluate notifications
    eval_res = client.post(
        "/api/v1/notifications/evaluate",
        json={
            "session_id": "api_test_session_456",
        },
    )
    assert eval_res.status_code == 200
    assert eval_res.json()["success"] is True

    # 5. Mark all as read
    read_all_res = client.put("/api/v1/notifications/read-all?session_id=api_test_session_456")
    assert read_all_res.status_code == 200
    assert read_all_res.json()["success"] is True

    # 6. Unwatch journey
    del_res = client.delete(f"/api/v1/notifications/watched/{watched_id}?session_id=api_test_session_456")
    assert del_res.status_code == 200
    assert del_res.json()["data"] is True
