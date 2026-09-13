import datetime
from typing import Any, Dict, List, Optional, Tuple
from src.core.config import settings
from src.core.logging import logger
from src.schemas.prediction import StationFeatures
from src.services.festival_service import festival_service
from src.services.weather_service import weather_service


class FeatureExtractor:
    """Extracts ML features matching docs/model/predictors.txt plus Calendarific festival and Open-Meteo weather factors."""

    def extract_features_for_upcoming_route(
        self, live_data: Dict[str, Any]
    ) -> List[Tuple[Dict[str, Any], StationFeatures]]:
        """Extract the feature predictors for all upcoming stations along the route.

        Returns a list of tuples: (station_stop_dict, station_features)
        """
        route = live_data.get("route", [])
        if not route:
            logger.warning("Empty route found in live status data")
            return []

        # 1. Determine Current Telemetry Context
        curr_delay = float(live_data.get("delayMinutes", 0.0) or 0.0)
        curr_loc = live_data.get("currentLocation", {})
        curr_seq = int(curr_loc.get("sequence", 1) or 1)

        # 2. Date / Calendar & Festival Context
        start_date_str = live_data.get("startDate")
        day_of_week, month, is_weekend = self._extract_calendar_features(start_date_str)
        fest_feats = festival_service.get_features_for_date(start_date_str)

        # 3. Turnaround / Previous Journey Context (Zero Target Leakage)
        turnaround_dict = self.extract_turnaround_features(live_data)

        # 4. Find current station distance
        curr_dist = 0.0
        for stop in route:
            if stop.get("sequence") == curr_seq:
                curr_dist = float(stop.get("distance", 0.0) or 0.0)
                # If stop has a more recent departed delay, use it
                if stop.get("delayDeparture") is not None:
                    curr_delay = float(stop.get("delayDeparture"))
                elif stop.get("delayArrival") is not None:
                    curr_delay = float(stop.get("delayArrival"))
                break

        hist_avg_delay = float(settings.DEFAULT_HISTORICAL_DELAY)

        # 5. Generate features for all upcoming stations
        upcoming_features: List[Tuple[Dict[str, Any], StationFeatures]] = []

        for stop in route:
            seq = int(stop.get("sequence", 0))
            # Only upcoming stops
            if seq <= curr_seq and stop.get("status") == "departed":
                continue

            next_station_no = seq
            next_dist = float(stop.get("distance", curr_dist) or curr_dist)
            segment_distance = max(0.0, next_dist - curr_dist)

            # Weather sampling at target upcoming station coordinates and expected time
            stop_lat = stop.get("lat")
            stop_lng = stop.get("lng")
            sched_arr = stop.get("scheduledArrival") or stop.get("scheduledDeparture")

            stop_dt = None
            if sched_arr:
                try:
                    stop_dt = datetime.datetime.fromisoformat(sched_arr)
                except Exception:
                    pass

            weather_data = weather_service.get_weather_for_location_and_time(
                lat=stop_lat,
                lng=stop_lng,
                dt=stop_dt,
            )

            features = StationFeatures(
                curr_delay=curr_delay,
                station_no=curr_seq,
                curr_dist=curr_dist,
                next_station_no=next_station_no,
                next_dist=next_dist,
                segment_distance=segment_distance,
                day_of_week=day_of_week,
                month=month,
                is_weekend=is_weekend,
                hist_train_avg_delay=hist_avg_delay,
                is_festival=fest_feats["is_festival"],
                festival_importance=fest_feats["festival_importance"],
                days_to_festival=fest_feats["days_to_festival"],
                days_from_festival=fest_feats["days_from_festival"],
                festival_factor=fest_feats["festival_factor"],
                historical_festival_delay=fest_feats["historical_festival_delay"],
                festival_name=fest_feats["festival_name"],
                previous_trip_delay=turnaround_dict["previous_trip_delay"],
                turnaround_time=turnaround_dict["turnaround_time"],
                turnaround_delay=turnaround_dict["turnaround_delay"],
                weather_severity=weather_data["weather_severity"],
                rain_mm=weather_data["rain_mm"],
                wind_speed_kmh=weather_data["wind_speed_kmh"],
                visibility_m=weather_data["visibility_m"],
                is_heavy_rain=weather_data["is_heavy_rain"],
                is_low_visibility=weather_data["is_low_visibility"],
                is_strong_wind=weather_data["is_strong_wind"],
                weather_condition=weather_data["condition_description"],
            )

            upcoming_features.append((stop, features))

        return upcoming_features

    def extract_turnaround_features(self, live_data: Dict[str, Any]) -> Dict[str, float]:
        """Extract turnaround / incoming rake delay features strictly from origin telemetry."""
        route = live_data.get("route", [])
        origin_stop = route[0] if route else {}
        origin_delay = float(
            origin_stop.get("delayDeparture")
            if origin_stop.get("delayDeparture") is not None
            else (origin_stop.get("delayArrival") or 0.0)
        )

        turnaround_time = float(live_data.get("turnaroundBufferMinutes", 120.0) or 120.0)
        # Inherited delay from previous trip or initial late start at origin
        prev_trip_delay = float(live_data.get("previousTripDelay", origin_delay) or origin_delay)
        turnaround_delay = max(0.0, float(prev_trip_delay))

        return {
            "previous_trip_delay": round(prev_trip_delay, 1),
            "turnaround_time": round(turnaround_time, 1),
            "turnaround_delay": round(turnaround_delay, 1),
        }

    def _extract_calendar_features(self, date_str: Optional[str]) -> Tuple[int, int, int]:
        """Parse journey date to extract (day_of_week, month, is_weekend)."""
        if date_str:
            try:
                # Handle YYYY-MM-DD
                dt = datetime.datetime.strptime(date_str[:10], "%Y-%m-%d")
                dow = dt.weekday()  # 0=Monday, 6=Sunday
                month = dt.month
                is_weekend = 1 if dow in (5, 6) else 0
                return dow, month, is_weekend
            except Exception:
                pass

        now = datetime.datetime.now()
        dow = now.weekday()
        return dow, now.month, (1 if dow in (5, 6) else 0)


feature_extractor = FeatureExtractor()
