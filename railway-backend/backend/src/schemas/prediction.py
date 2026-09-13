from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from src.schemas.live_status import CurrentLocation

# The exact 10 baseline features required by the LightGBM baseline model
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

# Calendarific Festival Features for Indian Railways delay modeling
FESTIVAL_FEATURES: List[str] = [
    "is_festival",
    "festival_importance",
    "days_to_festival",
    "days_from_festival",
    "festival_factor",
    "historical_festival_delay",
]

# Turnaround / Previous Journey Delay Features
TURNAROUND_FEATURES: List[str] = [
    "previous_trip_delay",
    "turnaround_time",
    "turnaround_delay",
]

# Open-Meteo Weather Delay Features
WEATHER_FEATURES: List[str] = [
    "weather_severity",
    "rain_mm",
    "wind_speed_kmh",
    "visibility_m",
    "is_heavy_rain",
    "is_low_visibility",
    "is_strong_wind",
]

ALL_FEATURES: List[str] = FEATURES + FESTIVAL_FEATURES + TURNAROUND_FEATURES + WEATHER_FEATURES


class StationFeatures(BaseModel):
    """The feature predictors defined in docs/model/predictors.txt plus Calendarific festival and Open-Meteo weather factors."""

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

    # Festival Features (Calendarific India)
    is_festival: int = Field(default=0, description="1 if journey is within festival window else 0")
    festival_importance: float = Field(default=0.0, description="Festival importance score (0.0 to 3.0)")
    days_to_festival: float = Field(default=99.0, description="Days to nearest upcoming festival")
    days_from_festival: float = Field(default=99.0, description="Days from nearest past festival")
    festival_factor: float = Field(default=0.0, description="Continuous festival proximity and impact factor")
    historical_festival_delay: float = Field(default=0.0, description="Estimated historical delay surge during festival")
    festival_name: Optional[str] = Field(default=None, description="Name of closest festival if active")

    # Turnaround / Previous Journey Delay Features
    previous_trip_delay: float = Field(default=0.0, description="Delay inherited from previous trip / incoming rake in minutes")
    turnaround_time: float = Field(default=120.0, description="Scheduled rake turnaround buffer time in minutes")
    turnaround_delay: float = Field(default=0.0, description="Estimated delay contribution due to turnaround buffer overrun")

    # Open-Meteo Weather Delay Features
    weather_severity: int = Field(default=0, description="0=Normal, 1=Mild, 2=Moderate, 3=Severe")
    rain_mm: float = Field(default=0.0, description="Precipitation / rain in mm")
    wind_speed_kmh: float = Field(default=12.0, description="Wind speed at 10m in km/h")
    visibility_m: float = Field(default=10000.0, description="Horizontal visibility in meters")
    is_heavy_rain: int = Field(default=0, description="1 if rain >= 15mm else 0")
    is_low_visibility: int = Field(default=0, description="1 if visibility < 1000m else 0")
    is_strong_wind: int = Field(default=0, description="1 if wind speed >= 40 km/h else 0")
    weather_condition: Optional[str] = Field(default=None, description="Text description of weather condition")

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
            "is_festival": float(self.is_festival),
            "festival_importance": float(self.festival_importance),
            "days_to_festival": float(self.days_to_festival),
            "days_from_festival": float(self.days_from_festival),
            "festival_factor": float(self.festival_factor),
            "historical_festival_delay": float(self.historical_festival_delay),
            "previous_trip_delay": float(self.previous_trip_delay),
            "turnaround_time": float(self.turnaround_time),
            "turnaround_delay": float(self.turnaround_delay),
            "weather_severity": float(self.weather_severity),
            "rain_mm": float(self.rain_mm),
            "wind_speed_kmh": float(self.wind_speed_kmh),
            "visibility_m": float(self.visibility_m),
            "is_heavy_rain": float(self.is_heavy_rain),
            "is_low_visibility": float(self.is_low_visibility),
            "is_strong_wind": float(self.is_strong_wind),
        }

    def to_feature_vector(self) -> List[float]:
        """Return baseline 10 features in ordered list matching baseline model expectations."""
        return [self.to_dict()[f] for f in FEATURES]

    def to_extended_feature_vector(self) -> List[float]:
        """Return all features including festival predictors."""
        return [self.to_dict()[f] for f in ALL_FEATURES]


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
    """Response matching the exact LightGBM model service contract with festival metadata."""

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
    festival_info: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Calendarific Indian festival context",
        alias="festival_info",
    )
    turnaround_info: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Previous journey and rake turnaround delay context",
        alias="turnaround_info",
    )

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
    weather_info: Optional[Dict[str, Any]] = Field(default=None, alias="weatherInfo")

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
    festival_info: Optional[Dict[str, Any]] = Field(default=None, alias="festivalInfo")
    turnaround_info: Optional[Dict[str, Any]] = Field(default=None, alias="turnaroundInfo")
    weather_info: Optional[Dict[str, Any]] = Field(default=None, alias="weatherInfo")
    route: List[PredictedStationETA]

    model_config = {"populate_by_name": True}
