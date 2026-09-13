from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings and configuration."""

    model_config = SettingsConfigDict(
        env_file=(
            ".env",
            str(Path(__file__).resolve().parents[2] / ".env"),
            str(Path(__file__).resolve().parents[3] / ".env"),
        ),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # General Project Info
    PROJECT_NAME: str = "Indian Railways Dynamic ETA Predictor"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    # RailRadar Upstream API
    RAILRADAR_API_KEY: str = ""
    RAILRADAR_BASE_URL: str = "https://api.railradar.in/v1"
    RAILRADAR_TIMEOUT_SECONDS: float = 10.0

    # Cache Settings
    CACHE_TTL_LIVE_SECONDS: int = 30
    CACHE_TTL_STATIC_SECONDS: int = 3600

    # Fallback / Resilience
    ENABLE_MOCK_FALLBACK: bool = True

    # ML Model Configuration
    MODEL_PATH: str = str(
        Path(__file__).resolve().parents[2] / "models" / "lightgbm_1m.pkl"
        if (Path(__file__).resolve().parents[2] / "models" / "lightgbm_1m.pkl").is_file()
        else Path(__file__).resolve().parents[1] / "models" / "lightgbm_1m.pkl"
    )
    MODEL_NAME: str = "lightgbm_1m"
    DEFAULT_HISTORICAL_DELAY: float = 15.0

    # CORS configuration
    CORS_ORIGINS: List[str] = ["*"]

    # Database & Authentication
    DATABASE_URL: str = "sqlite:///./railway.db"
    SECRET_KEY: str = "change-in-env-file-for-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Calendarific Festival API Configuration
    CALENDARIFIC_API_KEY: str = ""
    CALENDARIFIC_BASE_URL: str = "https://calendarific.com/api/v2"
    CALENDARIFIC_COUNTRY: str = "IN"
    CALENDARIFIC_CACHE_DIR: str = "data/festivals"
    FESTIVAL_WINDOW_DAYS: int = 3


settings = Settings()
