from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class StationBrief(BaseModel):
    """Station summary information."""

    code: str
    name: str


class TrainInfo(BaseModel):
    """Core train details."""

    number: str
    name: str
    type: Optional[str] = None
    category: Optional[str] = None
    source: StationBrief
    destination: StationBrief
    run_days: Optional[List[str]] = Field(default=None, alias="runDays")
    distance: Optional[float] = None
    duration: Optional[int] = None
    avg_speed: Optional[float] = Field(default=None, alias="avgSpeed")
    max_speed: Optional[float] = Field(default=None, alias="maxSpeed")
    total_halts: Optional[int] = Field(default=None, alias="totalHalts")
    coach_position: Optional[str] = Field(default=None, alias="coachPosition")

    model_config = {"populate_by_name": True}


class ScheduleStop(BaseModel):
    """Station stop in the train's scheduled timetable."""

    sequence: int
    station: StationBrief
    arrival: Optional[str] = None
    departure: Optional[str] = None
    arrival_day: Optional[int] = Field(default=1, alias="arrivalDay")
    departure_day: Optional[int] = Field(default=1, alias="departureDay")
    distance: float = 0.0
    is_halt: bool = Field(default=True, alias="isHalt")
    platform: Optional[str] = None
    speed_to_next_station_kmph: Optional[float] = Field(
        default=None, alias="speedToNextStationKmph"
    )

    model_config = {"populate_by_name": True}


class TrainScheduleResponse(BaseModel):
    """Full schedule timetable response."""

    train: TrainInfo
    route: List[ScheduleStop]


class RouteStopGIS(BaseModel):
    """Station coordinates and metadata for map rendering."""

    sequence: int
    code: str
    name: str
    lat: float
    lng: float


class RouteGeometryResponse(BaseModel):
    """Route GIS track geometry payload."""

    train_number: str = Field(alias="trainNumber")
    format: str = "geojson"
    geojson: Optional[Dict[str, Any]] = None
    stops: Optional[List[RouteStopGIS]] = None

    model_config = {"populate_by_name": True}
