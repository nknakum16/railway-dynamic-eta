from src.services.eta_service import ETAService, eta_service
from src.services.model_service import ModelManager, model_manager
from src.services.railradar_client import RailRadarClient, railradar_client


def get_railradar_client() -> RailRadarClient:
    """Dependency provider for RailRadar client."""
    return railradar_client


def get_eta_service() -> ETAService:
    """Dependency provider for dynamic ETA service."""
    return eta_service


def get_model_manager() -> ModelManager:
    """Dependency provider for ML model manager."""
    return model_manager
