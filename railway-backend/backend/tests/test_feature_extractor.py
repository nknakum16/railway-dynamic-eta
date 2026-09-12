from src.services.feature_extractor import feature_extractor
from src.services.railradar_client import railradar_client


def test_extract_features_shape_and_content():
    mock_data = railradar_client._generate_mock_live_status("12919")
    upcoming_pairs = feature_extractor.extract_features_for_upcoming_route(mock_data)

    assert len(upcoming_pairs) > 0

    for stop, features in upcoming_pairs:
        vector = features.to_feature_vector()
        assert len(vector) == 10
        assert features.next_station_no >= features.station_no
        assert features.segment_distance >= 0.0
        assert 0 <= features.day_of_week <= 6
        assert 1 <= features.month <= 12
        assert features.is_weekend in (0, 1)
        assert features.hist_train_avg_delay > 0
