import datetime
from typing import Any, Dict, List, Optional
from src.core.logging import logger
from src.schemas.live_status import CurrentLocation
from src.schemas.prediction import PredictedStationETA, TrainETAResponse
from src.services.feature_extractor import feature_extractor
from src.services.model_service import model_manager
from src.services.railradar_client import railradar_client


class ETAService:
    """Orchestrates live data ingestion, feature engineering, and ML inference to produce dynamic ETAs."""

    async def calculate_dynamic_eta(
        self,
        train_number: str,
        date: Optional[str] = None,
        authoritative: bool = False,
    ) -> TrainETAResponse:
        """Fetch live train running status, predict upcoming delays, and return synthesized ETAs."""
        # 1. Fetch live status from upstream / cache / mock fallback
        live_data = await railradar_client.get_live_status(
            train_number=train_number,
            date=date,
            authoritative=authoritative,
        )

        curr_delay = float(live_data.get("delayMinutes", 0.0) or 0.0)
        curr_loc_dict = live_data.get("currentLocation", {})
        curr_seq = int(curr_loc_dict.get("sequence", 1) or 1)

        current_location = CurrentLocation(
            stationCode=curr_loc_dict.get("stationCode", "UNK"),
            sequence=curr_seq,
            status=curr_loc_dict.get("status", "running"),
            isHalt=curr_loc_dict.get("isHalt", True),
            isDiverted=curr_loc_dict.get("isDiverted", False),
            isActualPosition=curr_loc_dict.get("isActualPosition", True),
            segmentProgress=float(curr_loc_dict.get("segmentProgress", 0.0) or 0.0),
            speedKmh=float(curr_loc_dict.get("speedKmh", 0.0) or 0.0),
            bearingDegrees=curr_loc_dict.get("bearingDegrees"),
        )

        # 2. Extract features for upcoming stops
        upcoming_pairs = feature_extractor.extract_features_for_upcoming_route(live_data)

        # 3. Model inference
        predictor = model_manager.get_predictor()
        if upcoming_pairs:
            features_list = [f for _, f in upcoming_pairs]
            delay_predictions = predictor.predict(features_list)
        else:
            delay_predictions = []

        # Map predictions back by station sequence: total_delay = curr_delay + additional_delay
        pred_map: Dict[int, float] = {}
        for (stop, _), add_delay in zip(upcoming_pairs, delay_predictions):
            pred_map[int(stop["sequence"])] = curr_delay + add_delay

        # 4. Construct enriched route stops with dynamic ETA
        enriched_route: List[PredictedStationETA] = []
        raw_route = live_data.get("route", [])

        for stop in raw_route:
            seq = int(stop.get("sequence", 0))
            is_passed = (seq < curr_seq) or (seq == curr_seq and stop.get("status") == "departed")

            sched_arr = stop.get("scheduledArrival")
            sched_dep = stop.get("scheduledDeparture")
            act_arr = stop.get("actualArrival")
            act_dep = stop.get("actualDeparture")

            if is_passed:
                # Historical stop
                stop_status = "departed"
                pred_delay = float(
                    stop.get("delayDeparture")
                    if stop.get("delayDeparture") is not None
                    else (stop.get("delayArrival") or 0.0)
                )
                pred_arr = act_arr or sched_arr
                pred_dep = act_dep or sched_dep
                trend = "stable"
            elif seq == curr_seq:
                # Current halt / segment
                stop_status = "current"
                pred_delay = curr_delay
                pred_arr = act_arr or self._add_minutes_to_iso(sched_arr, pred_delay)
                pred_dep = self._add_minutes_to_iso(sched_dep, pred_delay)
                trend = "stable"
            else:
                # Upcoming station
                stop_status = "upcoming"
                pred_delay = pred_map.get(seq, curr_delay)
                pred_arr = self._add_minutes_to_iso(sched_arr, pred_delay)
                pred_dep = self._add_minutes_to_iso(sched_dep, pred_delay)

                # Determine delay trend relative to current delay
                if pred_delay < (curr_delay - 2.0):
                    trend = "improving"
                elif pred_delay > (curr_delay + 2.0):
                    trend = "increasing"
                else:
                    trend = "stable"

            station_eta = PredictedStationETA(
                sequence=seq,
                stationCode=stop.get("stationCode", "UNK"),
                stationName=stop.get("stationName", "Unknown Station"),
                status=stop_status,
                distance=float(stop.get("distance", 0.0) or 0.0),
                scheduledArrival=sched_arr,
                scheduledDeparture=sched_dep,
                actualArrival=act_arr,
                actualDeparture=act_dep,
                predictedArrival=pred_arr,
                predictedDeparture=pred_dep,
                predictedDelayMinutes=round(pred_delay, 1),
                delayTrend=trend,
                platform=stop.get("platform"),
                lat=stop.get("lat"),
                lng=stop.get("lng"),
            )
            enriched_route.append(station_eta)

        return TrainETAResponse(
            trainNumber=str(live_data.get("trainNumber", train_number)),
            trainName=str(live_data.get("trainName", f"Train {train_number}")),
            startDate=live_data.get("startDate"),
            status=live_data.get("status", "running"),
            overallDelayMinutes=curr_delay,
            currentLocation=current_location,
            modelUsed=predictor.get_model_name(),
            route=enriched_route,
        )

    def _add_minutes_to_iso(
        self, time_str: Optional[str], minutes_to_add: float
    ) -> Optional[str]:
        """Add delay minutes to an ISO-8601 string or HH:MM string."""
        if not time_str:
            return None

        try:
            # Check for standard ISO format: 2026-06-23T01:45:00+05:30 or similar
            if "T" in time_str:
                dt = datetime.datetime.fromisoformat(time_str)
                new_dt = dt + datetime.timedelta(minutes=minutes_to_add)
                return new_dt.isoformat()

            # Check for HH:MM format
            if ":" in time_str and len(time_str) == 5:
                hh, mm = map(int, time_str.split(":"))
                total_min = (hh * 60 + mm + int(minutes_to_add)) % (24 * 60)
                new_hh = total_min // 60
                new_mm = total_min % 60
                return f"{new_hh:02d}:{new_mm:02d}"

        except Exception as exc:
            logger.debug("Could not parse time string '%s': %s", time_str, exc)

        return time_str


eta_service = ETAService()
