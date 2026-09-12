from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from src.schemas.live_status import CurrentLocation

# The exact 10 features and ordering required by the LightGBM model
FEATURES: List[str] = [
    "curr_delay",
    "station_no",
    "curr_dist",
    "next_station_no",
    "next_dist",
    "segment_distance",
    "day_of_week",
    "month",
    "is_weekend",
    "hist_train_avg_delay",
]


class StationFeatures(BaseModel):
    """The 10 feature predictors defined in docs/model/predictors.txt."""

    curr_delay: float = Field(..., description="Current train delay in minutes")
    station_no: int = Field(..., description="Current station sequence number")
    curr_dist: float = Field(..., description="Cumulative distance at current station in km")
    next_station_no: int = Field(..., description="Next station sequence number")
    next_dist: float = Field(..., description="Cumulative distance at next station in km")
    segment_distance: float = Field(..., description="Distance between current and next station in km")
    day_of_week: int = Field(..., ge=0, le=6, description="Day of week: 0=Monday, 6=Sunday")
    month: int = Field(..., ge=1, le=12, description="Month: 1-12")
    is_weekend: int = Field(..., ge=0, le=1, description="1 if weekend (Sat/Sun) else 0")
    hist_train_avg_delay: float = Field(..., description="Historical average delay of this train in minutes")

    def to_dict(self) -> Dict[str, float]:
        """Return features mapped as dictionary with exact column names."""
        return {
            "curr_delay": float(self.curr_delay),
            "station_no": float(self.station_no),
            "curr_dist": float(self.curr_dist),
            "next_station_no": float(self.next_station_no),
            "next_dist": float(self.next_dist),
            "segment_distance": float(self.segment_distance),
            "day_of_week": float(self.day_of_week),
            "month": float(self.month),
            "is_weekend": float(self.is_weekend),
            "hist_train_avg_delay": float(self.hist_train_avg_delay),
        }

    def to_feature_vector(self) -> List[float]:
        """Return features in ordered list matching model expectations."""
        return [self.to_dict()[f] for f in FEATURES]


class SinglePredictRequest(BaseModel):
    """Request payload for predicting additional delay on a single station segment."""

    features: StationFeatures
    scheduled_arrival_next: Optional[str] = Field(
        default=None,
        description="Scheduled arrival at next station (ISO-8601 or HH:MM) to compute predicted_eta",
        alias="scheduledArrivalNext",
    )

    model_config = {"populate_by_name": True}


class SinglePredictResponse(BaseModel):
    """Response matching the exact LightGBM model service contract."""

    predicted_additional_delay_minutes: float = Field(
        ...,
        description="Predicted additional delay (delay_next - delay_curr) clamped to >= 0",
        alias="predicted_additional_delay_minutes",
    )
    current_delay_minutes: float = Field(
        ...,
        description="Current train delay in minutes",
        alias="current_delay_minutes",
    )
    predicted_eta: Optional[str] = Field(
        default=None,
        description="Computed predicted ETA = scheduled_arrival_next + current_delay + predicted_additional_delay",
        alias="predicted_eta",
    )
    model: str = Field(..., description="Model identifier", alias="model")
    model_artifact: str = Field(..., description="Model artifact path", alias="model_artifact")

    model_config = {"populate_by_name": True}


class BatchPredictRequest(BaseModel):
    """Payload for direct batch ML inference."""

    features: List[StationFeatures]


class BatchPredictResponse(BaseModel):
    """Response containing array of predicted additional delays."""

    predictions: List[float] = Field(
        ...,
        description="Array of predicted additional delays in minutes (clamped to >= 0)",
    )
    model_used: str


class PredictedStationETA(BaseModel):
    """Enriched station stop with scheduled, actual, and predicted dynamic ETA."""

    sequence: int
    station_code: str = Field(alias="stationCode")
    station_name: str = Field(alias="stationName")
    status: str  # 'departed', 'current', 'upcoming'
    distance: float
    scheduled_arrival: Optional[str] = Field(default=None, alias="scheduledArrival")
    scheduled_departure: Optional[str] = Field(default=None, alias="scheduledDeparture")
    actual_arrival: Optional[str] = Field(default=None, alias="actualArrival")
    actual_departure: Optional[str] = Field(default=None, alias="actualDeparture")
    predicted_arrival: Optional[str] = Field(default=None, alias="predictedArrival")
    predicted_departure: Optional[str] = Field(default=None, alias="predictedDeparture")
    predicted_delay_minutes: float = Field(default=0.0, alias="predictedDelayMinutes")
    delay_trend: str = Field(
        default="neutral",
        description="'improving' (delay reduced), 'increasing' (delay worsened), or 'stable'",
        alias="delayTrend",
    )
    platform: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    model_config = {"populate_by_name": True}


class TrainETAResponse(BaseModel):
    """Dynamic ETA payload returned to the frontend."""

    train_number: str = Field(alias="trainNumber")
    train_name: str = Field(alias="trainName")
    start_date: Optional[str] = Field(default=None, alias="startDate")
    status: str = "running"
    overall_delay_minutes: float = Field(default=0.0, alias="overallDelayMinutes")
    current_location: CurrentLocation = Field(alias="currentLocation")
    model_used: str = Field(alias="modelUsed")
    route: List[PredictedStationETA]

    model_config = {"populate_by_name": True}
