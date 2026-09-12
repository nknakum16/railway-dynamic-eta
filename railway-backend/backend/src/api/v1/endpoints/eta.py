from typing import Optional
from fastapi import APIRouter, Depends, Query
from src.api.deps import get_eta_service
from src.schemas.common import ApiResponse
from src.schemas.prediction import TrainETAResponse
from src.services.eta_service import ETAService

router = APIRouter()


@router.get("/trains/{train_number}/eta", response_model=ApiResponse[TrainETAResponse])
async def get_dynamic_train_eta(
    train_number: str,
    date: Optional[str] = Query(
        default=None,
        description="Journey start date in YYYY-MM-DD format (optional).",
    ),
    authoritative: bool = Query(
        default=False,
        description="Bypass cache and force upstream live telemetry refresh.",
    ),
    service: ETAService = Depends(get_eta_service),
) -> ApiResponse[TrainETAResponse]:
    """Primary Dynamic ETA Predictor Endpoint.

    Fetches live train telemetry from RailRadar, extracts ML feature vectors for all upcoming
    stations according to the 10-feature predictors specification, performs inference via the
    ML model service, and synthesizes dynamic arrival and departure times with delay trends.
    """
    eta_response = await service.calculate_dynamic_eta(
        train_number=train_number,
        date=date,
        authoritative=authoritative,
    )
    return ApiResponse(success=True, data=eta_response)
