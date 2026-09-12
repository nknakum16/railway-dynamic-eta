from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from src.schemas.train import TrainInfo


class CurrentLocation(BaseModel):
    """Real-time train telemetry and positioning."""

    station_code: Optional[str] = Field(default=None, alias="stationCode")
    sequence: int = 1
    status: str = "running"
    is_halt: bool = Field(default=True, alias="isHalt")
    is_diverted: bool = Field(default=False, alias="isDiverted")
    is_actual_position: bool = Field(default=True, alias="isActualPosition")
    segment_progress: float = Field(default=0.0, alias="segmentProgress")
    speed_kmh: float = Field(default=0.0, alias="speedKmh")
    bearing_degrees: Optional[float] = Field(default=None, alias="bearingDegrees")

    model_config = {"populate_by_name": True}


class HaltReference(BaseModel):
    """Reference to a previous or upcoming halting station."""

    station_code: str = Field(alias="stationCode")
    station_name: str = Field(alias="stationName")
    sequence: int
    distance: float = 0.0

    model_config = {"populate_by_name": True}


class LiveRouteStop(BaseModel):
    """Station status within the live journey."""

    sequence: int
    station_code: str = Field(alias="stationCode")
    station_name: str = Field(alias="stationName")
    is_halt: bool = Field(default=True, alias="isHalt")
    lat: Optional[float] = None
    lng: Optional[float] = None
    scheduled_arrival: Optional[str] = Field(default=None, alias="scheduledArrival")
    scheduled_departure: Optional[str] = Field(default=None, alias="scheduledDeparture")
    actual_arrival: Optional[str] = Field(default=None, alias="actualArrival")
    actual_departure: Optional[str] = Field(default=None, alias="actualDeparture")
    delay_arrival: Optional[float] = Field(default=None, alias="delayArrival")
    delay_departure: Optional[float] = Field(default=None, alias="delayDeparture")
    status: str = "upcoming"  # departed, arrived, upcoming
    distance: float = 0.0
    speed_to_next_station_kmph: Optional[float] = Field(
        default=None, alias="speedToNextStationKmph"
    )
    platform: Optional[str] = None

    model_config = {"populate_by_name": True}


class LiveTrainStatus(BaseModel):
    """Comprehensive live train running status payload."""

    train_number: str = Field(alias="trainNumber")
    train_name: str = Field(alias="trainName")
    start_date: Optional[str] = Field(default=None, alias="startDate")
    last_updated_at: Optional[str] = Field(default=None, alias="lastUpdatedAt")
    status: str = "running"
    delay_minutes: float = Field(default=0.0, alias="delayMinutes")
    train: Optional[TrainInfo] = None
    current_location: CurrentLocation = Field(alias="currentLocation")
    previous_halt: Optional[HaltReference] = Field(default=None, alias="previousHalt")
    next_halt: Optional[HaltReference] = Field(default=None, alias="nextHalt")
    route: List[LiveRouteStop] = []

    model_config = {"populate_by_name": True}
