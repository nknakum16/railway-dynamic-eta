from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from src.api.deps import get_railradar_client
from src.schemas.common import ApiResponse
from src.services.railradar_client import RailRadarClient

router = APIRouter()


@router.get("/lookup/trains/popular", response_model=ApiResponse[List[Dict[str, Any]]])
async def get_popular_trains(
    client: RailRadarClient = Depends(get_railradar_client),
) -> ApiResponse[List[Dict[str, Any]]]:
    """Retrieve curated list of popular Indian Railways trains."""
    trains = await client.get_popular_trains()
    return ApiResponse(success=True, data=trains)


@router.get("/lookup/search/trains", response_model=ApiResponse[List[Dict[str, Any]]])
async def search_trains(
    q: str = Query(..., min_length=1, description="Search query: train number or name"),
    client: RailRadarClient = Depends(get_railradar_client),
) -> ApiResponse[List[Dict[str, Any]]]:
    """Search trains by train number or train name."""
    results = await client.search_trains(query=q)
    return ApiResponse(success=True, data=results)


@router.get("/lookup/search/stations", response_model=ApiResponse[List[Dict[str, Any]]])
async def search_stations(
    q: str = Query(..., min_length=1, description="Search query: station code, city, or name"),
    client: RailRadarClient = Depends(get_railradar_client),
) -> ApiResponse[List[Dict[str, Any]]]:
    """Search stations by station code or name for autocomplete."""
    results = await client.search_stations(query=q)
    return ApiResponse(success=True, data=results)


@router.get("/trains/between", response_model=ApiResponse[Dict[str, Any]])
async def get_trains_between(
    from_code: str = Query(..., alias="from", description="Source station code (e.g. NDLS)"),
    to_code: str = Query(..., alias="to", description="Destination station code (e.g. MMCT)"),
    date: Optional[str] = Query(default=None, description="Journey date in YYYY-MM-DD format"),
    client: RailRadarClient = Depends(get_railradar_client),
) -> ApiResponse[Dict[str, Any]]:
    """Retrieve direct trains running between two stations."""
    data = await client.get_trains_between(from_code=from_code, to_code=to_code, date=date)
    return ApiResponse(success=True, data=data)
