import datetime
from typing import Any, Dict, List, Optional, Tuple
from src.core.config import settings
from src.core.logging import logger
from src.schemas.prediction import StationFeatures


class FeatureExtractor:
    """Extracts ML features matching docs/model/predictors.txt from live and schedule data."""

    def extract_features_for_upcoming_route(
        self, live_data: Dict[str, Any]
    ) -> List[Tuple[Dict[str, Any], StationFeatures]]:
        """Extract the 10 feature predictors for all upcoming stations along the route.

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

        # 2. Date / Calendar Context
        start_date_str = live_data.get("startDate")
        day_of_week, month, is_weekend = self._extract_calendar_features(start_date_str)

        # 3. Find current station distance
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

        # 4. Generate features for all upcoming stations
        upcoming_features: List[Tuple[Dict[str, Any], StationFeatures]] = []

        for stop in route:
            seq = int(stop.get("sequence", 0))
            # Only upcoming stops
            if seq <= curr_seq and stop.get("status") == "departed":
                continue

            next_station_no = seq
            next_dist = float(stop.get("distance", curr_dist) or curr_dist)
            segment_distance = max(0.0, next_dist - curr_dist)

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
            )

            upcoming_features.append((stop, features))

        return upcoming_features

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
