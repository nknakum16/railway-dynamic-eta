import datetime
from unittest.mock import patch
import pytest
from src.services.festival_service import FestivalService, festival_service
from src.services.feature_extractor import feature_extractor
from src.services.railradar_client import railradar_client
from src.schemas.prediction import StationFeatures


def test_festival_detection_known_indian_holiday():
    """Verify festival features for Republic Day (2026-01-26) and Diwali (2026-11-08)."""
    # 1. Republic Day (National / Gazetted Holiday)
    rep_features = festival_service.get_features_for_date("2026-01-26")
    assert rep_features["is_festival"] == 1
    assert "republic" in rep_features["festival_name"].lower()
    assert rep_features["festival_importance"] >= 2.0
    assert rep_features["festival_factor"] > 0.0

    # 2. Naraka Chaturdasi / Diwali period in Nov 2026
    diwali_features = festival_service.get_features_for_date("2026-11-08")
    assert diwali_features["is_festival"] == 1
    assert diwali_features["festival_factor"] > 0.0
    assert diwali_features["historical_festival_delay"] > 0.0


def test_non_festival_regular_date():
    """Verify that a normal non-holiday mid-week date returns is_festival=0."""
    features = festival_service.get_features_for_date("2026-06-15")
    assert features["is_festival"] == 0
    assert features["festival_name"] == "None"
    assert features["festival_importance"] == 0.0
    assert features["festival_factor"] == 0.0
    assert features["historical_festival_delay"] == 0.0


def test_api_failure_offline_fallback():
    """Verify system does not crash if Calendarific API times out or raises an error."""
    mock_service = FestivalService()
    mock_service._memory_cache = {}

    # Simulate network failure during API call
    with patch.object(mock_service, "_fetch_from_api", return_value=[]):
        holidays = mock_service.get_holidays_for_year(2099)
        assert len(holidays) > 0  # Returns offline fallback catalog

        feats = mock_service.get_features_for_date("2099-01-26")
        assert feats["is_festival"] == 1
        assert "Republic Day" in feats["festival_name"]


def test_feature_extractor_includes_festival_factors():
    """Verify FeatureExtractor attaches festival factors to StationFeatures."""
    mock_data = railradar_client._generate_mock_live_status("12951")
    # Set journey date to Diwali 2026
    mock_data["startDate"] = "2026-11-08"

    pairs = feature_extractor.extract_features_for_upcoming_route(mock_data)
    assert len(pairs) > 0

    for stop, feats in pairs:
        assert isinstance(feats, StationFeatures)
        assert feats.is_festival == 1
        assert feats.festival_factor > 0.0
        assert feats.historical_festival_delay > 0.0
        # Ensure 10 baseline features are also preserved
        vec = feats.to_feature_vector()
        # And full feature vector has all 26 features (baseline + festival + turnaround + weather)
        ext_vec = feats.to_extended_feature_vector()
        assert len(ext_vec) == 26
        assert feats.turnaround_time > 0.0

