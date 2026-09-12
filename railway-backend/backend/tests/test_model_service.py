import math
from unittest.mock import MagicMock
import numpy as np
import pytest
from src.core.config import settings
from src.schemas.prediction import FEATURES, StationFeatures
from src.services.model_service import (
    HeuristicFallbackPredictor,
    LightGBMModelPredictor,
    model_manager,
)


def _make_sample_dict(curr_delay: float = 10.0, segment_dist: float = 50.0) -> dict:
    return {
        "curr_delay": curr_delay,
        "station_no": 2,
        "curr_dist": 40.0,
        "next_station_no": 3,
        "next_dist": 40.0 + segment_dist,
        "segment_distance": segment_dist,
        "day_of_week": 2,
        "month": 6,
        "is_weekend": 0,
        "hist_train_avg_delay": 12.0,
    }


def _make_sample_feature(curr_delay: float = 10.0, segment_dist: float = 50.0) -> StationFeatures:
    return StationFeatures(**_make_sample_dict(curr_delay=curr_delay, segment_dist=segment_dist))


# 1. The model artifact loads successfully
def test_model_artifact_loads_successfully():
    predictor = model_manager.get_predictor()
    assert predictor.is_trained() is True
    assert isinstance(predictor, LightGBMModelPredictor)
    assert predictor.get_model_path() == settings.MODEL_PATH


# 2. The model reports exactly 10 input features
def test_model_reports_ten_features():
    predictor = model_manager.get_predictor()
    assert isinstance(predictor, LightGBMModelPredictor)
    assert getattr(predictor._model, "n_features_in_", None) == 10


# 3. Feature order is preserved
def test_feature_order_is_preserved():
    predictor = model_manager.get_predictor()
    assert isinstance(predictor, LightGBMModelPredictor)
    model_features = list(getattr(predictor._model, "feature_name_", []))
    assert model_features == FEATURES


# 4. A valid feature payload returns a finite numeric prediction
def test_valid_payload_returns_finite_numeric_prediction():
    predictor = model_manager.get_predictor()
    feat_dict = _make_sample_dict(curr_delay=15.0, segment_dist=75.0)

    # Test single dictionary prediction
    pred = predictor.predict_additional_delay(feat_dict)
    assert isinstance(pred, float)
    assert not math.isnan(pred)
    assert not math.isinf(pred)
    assert pred >= 0.0

    # Test batch prediction via StationFeatures
    feat_obj = StationFeatures(**feat_dict)
    preds = predictor.predict([feat_obj])
    assert len(preds) == 1
    assert isinstance(preds[0], float)
    assert preds[0] >= 0.0


# 5. Missing features produce a validation error
def test_missing_features_produce_validation_error():
    predictor = model_manager.get_predictor()
    feat_dict = _make_sample_dict()
    del feat_dict["segment_distance"]

    with pytest.raises(ValueError, match="Missing model features"):
        predictor.predict_additional_delay(feat_dict)


# 6. Null or non-numeric feature values produce a validation error
def test_null_or_non_numeric_produce_validation_error():
    predictor = model_manager.get_predictor()
    feat_dict = _make_sample_dict()
    feat_dict["curr_delay"] = None  # type: ignore

    with pytest.raises(ValueError, match="Model features must not contain null values"):
        predictor.predict_additional_delay(feat_dict)


# 7. Negative raw model output is clamped to zero
def test_negative_raw_model_output_clamped_to_zero():
    predictor = model_manager.get_predictor()
    assert isinstance(predictor, LightGBMModelPredictor)

    # Mock the internal LGBM model predict to return a negative value
    original_predict = predictor._model.predict
    try:
        predictor._model.predict = MagicMock(return_value=np.array([-5.42]))
        feat_dict = _make_sample_dict()

        clamped = predictor.predict_additional_delay(feat_dict)
        assert clamped == 0.0

        batch_clamped = predictor.predict([StationFeatures(**feat_dict)])
        assert batch_clamped == [0.0]
    finally:
        predictor._model.predict = original_predict


# 8. The model is loaded once rather than once per request
def test_model_loaded_once_singleton():
    p1 = model_manager.get_predictor()
    p2 = model_manager.get_predictor()
    assert p1 is p2
    assert id(p1) == id(p2)


def test_heuristic_fallback_predictor():
    heuristic = HeuristicFallbackPredictor()
    feat = _make_sample_feature(curr_delay=15.0, segment_dist=100.0)
    preds = heuristic.predict([feat])

    assert len(preds) == 1
    assert isinstance(preds[0], float)
    assert preds[0] >= 0.0
    assert not heuristic.is_trained()
