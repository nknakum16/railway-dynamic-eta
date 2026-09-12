from typing import Any, Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Standard unified response envelope."""

    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """Error detail response."""

    success: bool = False
    error: str
    detail: Optional[str] = None


class ModelInfo(BaseModel):
    """Information about active ML model."""

    type: str
    loaded: bool
    model_path: Optional[str] = None


class HealthResponse(BaseModel):
    """Application health and status check payload."""

    status: str
    version: str
    model: ModelInfo
    cache_entries: int
