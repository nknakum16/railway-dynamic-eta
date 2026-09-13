import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class WatchPreferences(BaseModel):
    """Passenger notification preference options."""

    notify_significant_delay: bool = Field(default=True, description="Alert if delay exceeds threshold")
    delay_threshold_mins: int = Field(default=15, ge=1, le=180, description="Delay threshold in minutes (default 15)")
    notify_eta_changed: bool = Field(default=True, description="Alert if predicted ETA changes significantly")
    eta_threshold_mins: int = Field(default=10, ge=1, le=120, description="ETA change delta in minutes (default 10)")
    notify_departure: bool = Field(default=True, description="Alert when train departs")
    notify_approaching: bool = Field(default=True, description="Alert when approaching selected station")
    approaching_distance_km: float = Field(default=10.0, ge=1.0, le=50.0, description="Proximity distance for approach alert")
    notify_delay_severity: bool = Field(default=True, description="Alert when delay severity tier changes")
    notify_platform: bool = Field(default=True, description="Alert if platform changes (only if data exists)")


class WatchJourneyRequest(BaseModel):
    """Payload to watch a train journey."""

    train_number: str = Field(..., description="Train number e.g. 12951")
    train_name: Optional[str] = Field(default=None, description="Train name")
    origin_station: Optional[str] = Field(default=None, description="Origin station name")
    destination_station: Optional[str] = Field(default=None, description="Destination station name")
    target_station_code: Optional[str] = Field(default=None, description="Station to monitor approaching status for")
    target_station_name: Optional[str] = Field(default=None, description="Station name to monitor")
    session_id: Optional[str] = Field(default=None, description="Browser session ID for guest passengers")
    preferences: Optional[WatchPreferences] = Field(default_factory=WatchPreferences)


class WatchedJourneyResponse(BaseModel):
    """Response model for watched train journey."""

    id: int
    train_number: str
    train_name: Optional[str] = None
    origin_station: Optional[str] = None
    destination_station: Optional[str] = None
    target_station_code: Optional[str] = None
    target_station_name: Optional[str] = None
    notify_significant_delay: bool
    delay_threshold_mins: int
    notify_eta_changed: bool
    eta_threshold_mins: int
    notify_departure: bool
    notify_approaching: bool
    approaching_distance_km: float
    notify_delay_severity: bool
    notify_platform: bool
    is_active: bool
    last_known_delay: float
    last_known_eta: Optional[str] = None
    last_known_platform: Optional[str] = None
    last_severity_tier: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class NotificationResponse(BaseModel):
    """Response model for a notification message."""

    id: int
    watched_journey_id: Optional[int] = None
    train_number: str
    notification_type: str
    severity: str
    title: str
    message: str
    is_read: bool
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class NotificationSummaryResponse(BaseModel):
    """Summary of notifications and watched journeys."""

    unread_count: int
    total_count: int
    watched_count: int
    notifications: List[NotificationResponse]


class EvaluateNotificationsRequest(BaseModel):
    """Payload to trigger periodic background evaluation of watched trains."""

    session_id: Optional[str] = None
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None
