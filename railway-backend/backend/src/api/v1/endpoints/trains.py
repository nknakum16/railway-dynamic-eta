from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query
from src.api.deps import get_railradar_client
from src.schemas.common import ApiResponse
from src.schemas.live_status import LiveTrainStatus
from src.schemas.train import RouteGeometryResponse, TrainScheduleResponse
from src.services.railradar_client import RailRadarClient

router = APIRouter()


@router.get("/trains/{train_number}/live", response_model=ApiResponse[LiveTrainStatus])
async def get_live_train_status(
    train_number: str,
    date: Optional[str] = Query(
        default=None,
        description="Journey start date in YYYY-MM-DD format. Omit for current run.",
    ),
    authoritative: bool = Query(
        default=False,
        description="Bypass cache and force upstream live telemetry fetch.",
    ),
    halts_only: bool = Query(
        default=False,
        alias="haltsOnly",
        description="Return only halting stops in route array.",
    ),
    client: RailRadarClient = Depends(get_railradar_client),
) -> ApiResponse[LiveTrainStatus]:
    """Retrieve real-time live train running status, location telemetry, and delay."""
    data = await client.get_live_status(
        train_number=train_number,
        date=date,
        authoritative=authoritative,
        halts_only=halts_only,
    )
    # Parse and validate through Pydantic
    parsed = LiveTrainStatus.model_validate(data)
    return ApiResponse(success=True, data=parsed)


@router.get(
    "/trains/{train_number}/schedule",
    response_model=ApiResponse[TrainScheduleResponse],
)
async def get_train_schedule(
    train_number: str,
    halts_only: bool = Query(
        default=True,
        alias="haltsOnly",
        description="Filter to halting stations only.",
    ),
    client: RailRadarClient = Depends(get_railradar_client),
) -> ApiResponse[TrainScheduleResponse]:
    """Retrieve full train timetable and schedule."""
    data = await client.get_schedule(train_number=train_number, halts_only=halts_only)
    parsed = TrainScheduleResponse.model_validate(data)
    return ApiResponse(success=True, data=parsed)


@router.get(
    "/trains/{train_number}/route",
    response_model=ApiResponse[RouteGeometryResponse],
)
async def get_train_route_geometry(
    train_number: str,
    format: str = Query(
        default="geojson",
        pattern="^(geojson|polyline|coordinates)$",
        description="Geometry format: geojson, polyline, or coordinates.",
    ),
    stops: bool = Query(
        default=True,
        description="Include station stops alongside track coordinates.",
    ),
    client: RailRadarClient = Depends(get_railradar_client),
) -> ApiResponse[RouteGeometryResponse]:
    """Retrieve GIS track geometry coordinates for map visualization."""
    data = await client.get_route_geometry(
        train_number=train_number, format=format, stops=stops
    )
    parsed = RouteGeometryResponse.model_validate(data)
    return ApiResponse(success=True, data=parsed)
