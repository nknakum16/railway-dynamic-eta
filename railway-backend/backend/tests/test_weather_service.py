import pytest
from src.services.weather_service import weather_service
from src.services.feature_extractor import feature_extractor
from src.schemas.prediction import StationFeatures, ALL_FEATURES, WEATHER_FEATURES


def test_weather_service_defaults():
    """Test neutral fallback when coordinates are absent."""
    w = weather_service.get_weather_for_location_and_time(lat=None, lng=None)
    assert w["weather_severity"] == 0
    assert w["rain_mm"] == 0.0
    assert w["is_heavy_rain"] == 0
    assert "condition_description" in w


def test_weather_feature_derivation():
    """Test meteorological thresholds and severity derivation."""
    mock_day = {
        "hourly": {
            "time": ["2026-07-15T18:00"],
            "temperature_2m": [28.5],
            "precipitation": [22.0],
            "rain": [22.0],
            "wind_speed_10m": [45.0],
            "visibility": [800.0],
            "weather_code": [95],
        }
    }
    extracted = weather_service._extract_hourly_features(mock_day, hour=0)
    assert extracted["is_heavy_rain"] == 1
    assert extracted["is_low_visibility"] == 1
    assert extracted["is_strong_wind"] == 1
    assert extracted["is_storm"] == 1
    assert extracted["weather_severity"] == 3
    assert "Thunderstorm" in extracted["condition_description"]


def test_station_features_dict_includes_weather():
    """Verify StationFeatures dictionary contains all 26 predictors."""
    feat = StationFeatures(
        curr_delay=10.0,
        station_no=1,
        curr_dist=0.0,
        next_station_no=2,
        next_dist=120.0,
        segment_distance=120.0,
        day_of_week=3,
        month=7,
        is_weekend=0,
        hist_train_avg_delay=15.0,
        weather_severity=2,
        rain_mm=12.5,
        wind_speed_kmh=28.0,
        visibility_m=3500.0,
        is_heavy_rain=0,
        is_low_visibility=0,
        is_strong_wind=0,
    )
    d = feat.to_dict()
    for wf in WEATHER_FEATURES:
        assert wf in d
    assert len(d) == len(ALL_FEATURES)
    assert d["weather_severity"] == 2.0
