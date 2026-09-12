from fastapi import APIRouter, Depends
from src.api.deps import get_eta_service, get_model_manager
from src.schemas.common import ApiResponse
from src.schemas.prediction import (
    BatchPredictRequest,
    BatchPredictResponse,
    SinglePredictRequest,
    SinglePredictResponse,
)
from src.services.eta_service import ETAService
from src.services.model_service import ModelManager

router = APIRouter()


@router.post("/predict/segment", response_model=SinglePredictResponse)
async def predict_segment_additional_delay(
    request: SinglePredictRequest,
    model_mgr: ModelManager = Depends(get_model_manager),
    eta_svc: ETAService = Depends(get_eta_service),
) -> SinglePredictResponse:
    """Predict additional delay for a single station segment with optional ETA calculation.

    Returns the exact schema defined in the model integration specification:
    - predicted_additional_delay_minutes: delay_at_next - delay_at_current (clamped >= 0)
    - current_delay_minutes: current delay passed in features
    - predicted_eta: computed if scheduled_arrival_next is provided, else None (no fabricated data)
    - model: model identifier
    - model_artifact: path to serialized model artifact
    """
    predictor = model_mgr.get_predictor()
    add_delay = predictor.predict_additional_delay(request.features.to_dict())

    predicted_eta = None
    if request.scheduled_arrival_next:
        total_delay = request.features.curr_delay + add_delay
        predicted_eta = eta_svc._add_minutes_to_iso(
            request.scheduled_arrival_next, total_delay
        )

    return SinglePredictResponse(
        predicted_additional_delay_minutes=round(add_delay, 2),
        current_delay_minutes=round(float(request.features.curr_delay), 2),
        predicted_eta=predicted_eta,
        model=predictor.get_model_name(),
        model_artifact=predictor.get_model_path() or "fallback",
    )


@router.post("/predict/batch", response_model=ApiResponse[BatchPredictResponse])
async def predict_delay_batch(
    request: BatchPredictRequest,
    model_mgr: ModelManager = Depends(get_model_manager),
) -> ApiResponse[BatchPredictResponse]:
    """Direct ML inference endpoint for model evaluation and batch scoring.

    Accepts raw feature vectors adhering to docs/model/predictors.txt and returns predicted
    additional delays in minutes.
    """
    predictor = model_mgr.get_predictor()
    predictions = predictor.predict(request.features)

    return ApiResponse(
        success=True,
        data=BatchPredictResponse(
            predictions=[round(p, 2) for p in predictions],
            model_used=predictor.get_model_name(),
        ),
    )
