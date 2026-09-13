from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class CreateAlarmRequest(BaseModel):
    """Payload to create and persist a destination arrival alarm."""

    train_number: str = Field(..., description="Train number (e.g. 12951)")
    train_name: Optional[str] = Field(None, description="Train name (e.g. Mumbai Rajdhani)")
    origin_station: Optional[str] = Field(None, description="Starting station name or code")
    destination_station: str = Field(..., description="Destination station name where user wants to alight")
    destination_code: Optional[str] = Field(None, description="Destination station code (e.g. BPL, NDLS)")
    destination_lat: Optional[float] = Field(None, description="Destination station latitude")
    destination_lon: Optional[float] = Field(None, description="Destination station longitude")
    alarm_distance_km: float = Field(5.0, ge=0.5, le=50.0, description="Alarm trigger radius in kilometers before station")
    is_in_train: bool = Field(True, description="Whether the user is currently on the train")
    initial_user_lat: Optional[float] = Field(None, description="User's initial GPS latitude")
    initial_user_lon: Optional[float] = Field(None, description="User's initial GPS longitude")


class UpdateAlarmStatusRequest(BaseModel):
    """Payload to change the status of an active alarm (e.g., triggered, dismissed, cancelled)."""

    status: str = Field(..., description="New status: active, triggered, dismissed, cancelled")


class AlarmResponse(BaseModel):
    """Destination arrival alarm record."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    train_number: str
    train_name: Optional[str] = None
    origin_station: Optional[str] = None
    destination_station: str
    destination_code: Optional[str] = None
    destination_lat: Optional[float] = None
    destination_lon: Optional[float] = None
    alarm_distance_km: float
    status: str
    is_in_train: bool
    initial_user_lat: Optional[float] = None
    initial_user_lon: Optional[float] = None
    created_at: datetime
    triggered_at: Optional[datetime] = None
