from fastapi import APIRouter, Depends
from src.api.deps import get_model_manager
from src.core.cache import cache
from src.core.config import settings
from src.schemas.common import ApiResponse, HealthResponse, ModelInfo
from src.services.model_service import ModelManager

router = APIRouter()


@router.get("/health", response_model=ApiResponse[HealthResponse])
async def health_check(
    model_mgr: ModelManager = Depends(get_model_manager),
) -> ApiResponse[HealthResponse]:
    """Health check verifying API status, ML model status, and cache metrics."""
    predictor = model_mgr.get_predictor()
    cache_count = await cache.size()

    model_info = ModelInfo(
        type=predictor.get_model_name(),
        loaded=predictor.is_trained(),
        model_path=settings.MODEL_PATH if predictor.is_trained() else None,
    )

    data = HealthResponse(
        status="healthy",
        version=settings.VERSION,
        model=model_info,
        cache_entries=cache_count,
    )

    return ApiResponse(success=True, data=data)
