from abc import ABC, abstractmethod
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import joblib
import pandas as pd

from src.core.config import settings
from src.core.logging import logger
from src.schemas.prediction import FEATURES, StationFeatures


class BasePredictor(ABC):
    """Abstract interface for all ETA / delay prediction models."""

    @abstractmethod
    def predict(self, features_list: List[StationFeatures]) -> List[float]:
        """Predict additional delay in minutes for each feature set."""
        pass

    @abstractmethod
    def predict_additional_delay(self, values: Dict[str, float]) -> float:
        """Predict additional delay for a single feature dictionary."""
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        """Return the name/type of the predictor."""
        pass

    @abstractmethod
    def is_trained(self) -> bool:
        """Return whether this is an actual trained model artifact."""
        pass

    @abstractmethod
    def get_model_path(self) -> Optional[str]:
        """Return path to model artifact if applicable."""
        pass


class LightGBMModelPredictor(BasePredictor):
    """Predictor wrapping the serialized LightGBM baseline model artifact."""

    def __init__(self, model_path: str) -> None:
        self.model_path = str(Path(model_path).resolve())
        self._model = self._load_model()

    def _load_model(self) -> Any:
        logger.info("Initializing LightGBM model artifact from: %s", self.model_path)
        path_obj = Path(self.model_path)
        if not path_obj.is_file():
            raise FileNotFoundError(f"Model artifact not found: {self.model_path}")

        # Trusted repository code loaded via joblib as specified
        model = joblib.load(path_obj)

        # 1. Feature count & name verification
        n_features = getattr(model, "n_features_in_", None)
        model_features = list(getattr(model, "feature_name_", []))

        if model_features:
            self.expected_features = model_features
        elif n_features == len(FEATURES):
            self.expected_features = FEATURES
        elif n_features is not None and n_features == len(ALL_FEATURES):
            self.expected_features = ALL_FEATURES
        else:
            self.expected_features = FEATURES[:n_features] if n_features else FEATURES

        logger.info(
            "Successfully loaded LightGBM model (%s) expecting %d features (%s...)",
            type(model).__name__,
            len(self.expected_features),
            ", ".join(self.expected_features[:4]),
        )
        return model

    def predict_additional_delay(self, values: Dict[str, float]) -> float:
        """Validate input dictionary, construct DataFrame, and predict non-negative additional delay."""
        # 1. Check for missing features required by this specific model artifact
        missing = [name for name in self.expected_features if name not in values]
        if missing:
            raise ValueError(f"Missing model features: {missing}")

        # 2. Construct DataFrame with explicit column order matching model contract
        frame = pd.DataFrame(
            [[values[name] for name in self.expected_features]],
            columns=self.expected_features,
        )

        # 3. Numeric validation
        if frame.isna().any().any():
            raise ValueError("Model features must not contain null values")

        raw_prediction = float(self._model.predict(frame)[0])
        # Clamp raw prediction to zero for production ETA calculation
        return max(0.0, raw_prediction)

    def predict(self, features_list: List[StationFeatures]) -> List[float]:
        """Batch prediction over a list of StationFeatures."""
        if not features_list:
            return []

        # Convert list of Pydantic models to DataFrame ensuring exact column order
        rows = [f.to_dict() for f in features_list]
        frame = pd.DataFrame(rows, columns=self.expected_features)

        if frame.isna().any().any():
            raise ValueError("Model features must not contain null values")

        raw_predictions = self._model.predict(frame)
        return [max(0.0, float(p)) for p in raw_predictions]

    def get_model_name(self) -> str:
        return settings.MODEL_NAME

    def is_trained(self) -> bool:
        return True

    def get_model_path(self) -> Optional[str]:
        return self.model_path


class HeuristicFallbackPredictor(BasePredictor):
    """Domain-informed baseline model incorporating distance, weekend, and Calendarific festival factor."""

    def predict_additional_delay(self, values: Dict[str, float]) -> float:
        missing = [name for name in FEATURES if name not in values]
        if missing:
            raise ValueError(f"Missing model features: {missing}")

        seg_dist = float(values.get("segment_distance", 0.0))
        is_weekend = float(values.get("is_weekend", 0.0))
        fest_factor = float(values.get("festival_factor", 0.0))
        turnaround_delay = float(values.get("turnaround_delay", 0.0))

        # Combined congestion factor: weekend surge + festival traffic surge
        congestion = (1.15 if is_weekend else 1.0) * (1.0 + 0.15 * fest_factor)

        # Estimated additional delay between current and next station, factoring turnaround overrun
        turnaround_impact = min(3.0, turnaround_delay * 0.03)
        add_delay = (seg_dist / 100.0) * 1.8 * congestion + turnaround_impact
        return round(max(0.0, add_delay), 2)

    def predict(self, features_list: List[StationFeatures]) -> List[float]:
        return [self.predict_additional_delay(f.to_dict()) for f in features_list]

    def get_model_name(self) -> str:
        return "heuristic_fallback"

    def is_trained(self) -> bool:
        return False

    def get_model_path(self) -> Optional[str]:
        return None


class ModelManager:
    """Singleton manager ensuring one-time model loading at application startup."""

    def __init__(self) -> None:
        self._predictor: Optional[BasePredictor] = None

    def get_predictor(self) -> BasePredictor:
        """Return cached predictor singleton. Thread-safe read without per-request reload."""
        if self._predictor is not None:
            return self._predictor

        model_path = settings.MODEL_PATH
        if os.path.exists(model_path):
            try:
                self._predictor = LightGBMModelPredictor(model_path)
                return self._predictor
            except Exception as exc:
                logger.error(
                    "Failed to load LightGBM model from %s: %s. Falling back to heuristic baseline.",
                    model_path,
                    exc,
                )

        logger.warning(
            "Using HeuristicFallbackPredictor (model artifact not available at %s)",
            model_path,
        )
        self._predictor = HeuristicFallbackPredictor()
        return self._predictor

    def reload(self) -> BasePredictor:
        """Force reload of the predictor from disk."""
        self._predictor = None
        return self.get_predictor()


model_manager = ModelManager()
