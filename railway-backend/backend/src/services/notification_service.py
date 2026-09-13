import datetime
import math
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import desc
from sqlalchemy.orm import Session

from src.core.logging import logger
from src.db.models import Notification, User, WatchedJourney
from src.schemas.notification import (
    NotificationResponse,
    NotificationSummaryResponse,
    WatchedJourneyResponse,
    WatchJourneyRequest,
    WatchPreferences,
)
from src.services.eta_service import eta_service


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on the Earth in km."""
    r = 6371.0  # Earth radius in kilometers
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def get_severity_tier(delay_minutes: float) -> str:
    """Determine delay severity tier."""
    if delay_minutes <= 5.0:
        return "on_time"
    elif delay_minutes <= 15.0:
        return "minor"
    elif delay_minutes <= 45.0:
        return "moderate"
    else:
        return "major"


SEVERITY_LABELS = {
    "on_time": "🟢 On Time",
    "minor": "🟡 Minor Delay",
    "moderate": "🟠 Moderate Delay",
    "major": "🔴 Major Delay",
}


class NotificationService:
    """Smart notification evaluation engine with anti-spam rate limiting and GPS proximity."""

    def watch_journey(
        self,
        db: Session,
        request: WatchJourneyRequest,
        user: Optional[User] = None,
    ) -> WatchedJourney:
        """Create or update a journey watch subscription."""
        user_id = user.id if user else None
        prefs = request.preferences or WatchPreferences()

        # Check if already watching this train
        query = db.query(WatchedJourney).filter(
            WatchedJourney.train_number == request.train_number,
            WatchedJourney.is_active == True,
        )
        if user_id:
            query = query.filter(WatchedJourney.user_id == user_id)
        elif request.session_id:
            query = query.filter(WatchedJourney.session_id == request.session_id)

        watched = query.first()
        if not watched:
            watched = WatchedJourney(
                user_id=user_id,
                session_id=request.session_id,
                train_number=request.train_number,
                train_name=request.train_name,
                origin_station=request.origin_station,
                destination_station=request.destination_station,
                target_station_code=request.target_station_code,
                target_station_name=request.target_station_name,
            )
            db.add(watched)

        # Update preferences
        watched.notify_significant_delay = prefs.notify_significant_delay
        watched.delay_threshold_mins = prefs.delay_threshold_mins
        watched.notify_eta_changed = prefs.notify_eta_changed
        watched.eta_threshold_mins = prefs.eta_threshold_mins
        watched.notify_departure = prefs.notify_departure
        watched.notify_approaching = prefs.notify_approaching
        watched.approaching_distance_km = prefs.approaching_distance_km
        watched.notify_delay_severity = prefs.notify_delay_severity
        watched.notify_platform = prefs.notify_platform
        watched.is_active = True

        db.commit()
        db.refresh(watched)

        # Emit initial confirmation notification
        initial_notif = Notification(
            watched_journey_id=watched.id,
            user_id=user_id,
            session_id=request.session_id,
            train_number=watched.train_number,
            notification_type="watch_active",
            severity="info",
            title=f"🔔 Watching Journey: {watched.train_number}",
            message=(
                f"You are now watching Train {watched.train_number}"
                + (f" ({watched.train_name})" if watched.train_name else "")
                + f". We will notify you about significant delay and ETA updates."
            ),
        )
        db.add(initial_notif)
        db.commit()

        return watched

    def unwatch_journey(
        self,
        db: Session,
        watched_id: int,
        user: Optional[User] = None,
        session_id: Optional[str] = None,
    ) -> bool:
        """Deactivate a watched journey."""
        query = db.query(WatchedJourney).filter(WatchedJourney.id == watched_id)
        if user:
            query = query.filter(WatchedJourney.user_id == user.id)
        elif session_id:
            query = query.filter(WatchedJourney.session_id == session_id)

        watched = query.first()
        if watched:
            watched.is_active = False
            db.commit()
            return True
        return False

    def get_watched_journeys(
        self,
        db: Session,
        user: Optional[User] = None,
        session_id: Optional[str] = None,
    ) -> List[WatchedJourney]:
        """List all active watched journeys for the passenger."""
        query = db.query(WatchedJourney).filter(WatchedJourney.is_active == True)
        if user:
            query = query.filter(WatchedJourney.user_id == user.id)
        elif session_id:
            query = query.filter(WatchedJourney.session_id == session_id)
        else:
            return []

        return query.order_by(desc(WatchedJourney.created_at)).all()

    def get_notifications(
        self,
        db: Session,
        user: Optional[User] = None,
        session_id: Optional[str] = None,
        limit: int = 50,
    ) -> NotificationSummaryResponse:
        """Retrieve passenger notifications with unread count."""
        query = db.query(Notification)
        if user:
            query = query.filter(Notification.user_id == user.id)
        elif session_id:
            query = query.filter(Notification.session_id == session_id)
        else:
            return NotificationSummaryResponse(unread_count=0, total_count=0, watched_count=0, notifications=[])

        total_count = query.count()
        unread_count = query.filter(Notification.is_read == False).count()
        notifications = query.order_by(desc(Notification.created_at)).limit(limit).all()

        watched_count = self.get_watched_count(db, user, session_id)

        return NotificationSummaryResponse(
            unread_count=unread_count,
            total_count=total_count,
            watched_count=watched_count,
            notifications=[
                NotificationResponse.model_validate(n) for n in notifications
            ],
        )

    def get_watched_count(
        self,
        db: Session,
        user: Optional[User] = None,
        session_id: Optional[str] = None,
    ) -> int:
        """Get active watched journey count."""
        query = db.query(WatchedJourney).filter(WatchedJourney.is_active == True)
        if user:
            query = query.filter(WatchedJourney.user_id == user.id)
        elif session_id:
            query = query.filter(WatchedJourney.session_id == session_id)
        else:
            return 0
        return query.count()

    def mark_as_read(
        self,
        db: Session,
        notification_id: int,
        user: Optional[User] = None,
        session_id: Optional[str] = None,
    ) -> bool:
        """Mark single notification as read."""
        query = db.query(Notification).filter(Notification.id == notification_id)
        if user:
            query = query.filter(Notification.user_id == user.id)
        elif session_id:
            query = query.filter(Notification.session_id == session_id)

        notif = query.first()
        if notif:
            notif.is_read = True
            db.commit()
            return True
        return False

    def mark_all_as_read(
        self,
        db: Session,
        user: Optional[User] = None,
        session_id: Optional[str] = None,
    ) -> int:
        """Mark all notifications as read."""
        query = db.query(Notification).filter(Notification.is_read == False)
        if user:
            query = query.filter(Notification.user_id == user.id)
        elif session_id:
            query = query.filter(Notification.session_id == session_id)
        else:
            return 0

        updated_count = query.update({Notification.is_read: True})
        db.commit()
        return updated_count

    async def evaluate_watched_journeys(
        self,
        db: Session,
        user: Optional[User] = None,
        session_id: Optional[str] = None,
        user_lat: Optional[float] = None,
        user_lng: Optional[float] = None,
    ) -> List[Notification]:
        """Evaluator that checks live train status against user preferences with anti-spam logic."""
        watched_list = self.get_watched_journeys(db, user, session_id)
        new_notifications: List[Notification] = []

        for journey in watched_list:
            try:
                # Fetch fresh dynamic ETA for the watched train
                train_eta = await eta_service.calculate_dynamic_eta(journey.train_number)
                generated = self._evaluate_single_journey(
                    db=db,
                    journey=journey,
                    train_eta=train_eta,
                    user_lat=user_lat,
                    user_lng=user_lng,
                )
                new_notifications.extend(generated)
            except Exception as exc:
                logger.warning(
                    "Error evaluating watched train %s: %s",
                    journey.train_number,
                    exc,
                )

        if new_notifications:
            db.commit()

        return new_notifications

    def _evaluate_single_journey(
        self,
        db: Session,
        journey: WatchedJourney,
        train_eta: Any,
        user_lat: Optional[float] = None,
        user_lng: Optional[float] = None,
    ) -> List[Notification]:
        """Evaluate a single watched journey against current live status without spamming."""
        generated: List[Notification] = []
        now = datetime.datetime.now(datetime.timezone.utc)
        curr_delay = float(train_eta.overall_delay_minutes or 0.0)
        route = train_eta.route or []

        # Find target station or default to final destination
        target_code = (journey.target_station_code or "").upper()
        target_stop = None
        for stop in route:
            if target_code and (stop.station_code or "").upper() == target_code:
                target_stop = stop
                break
        if not target_stop and route:
            target_stop = route[-1]

        target_name = target_stop.station_name if target_stop else (journey.destination_station or "Destination")
        target_eta = target_stop.predicted_arrival if target_stop else None
        target_platform = target_stop.platform if target_stop else None

        # -------------------------------------------------------------
        # 1. Train Departure Alert
        # -------------------------------------------------------------
        if journey.notify_departure and not journey.has_departed:
            first_stop = route[0] if route else None
            # Check if train has departed origin
            has_departed = (
                train_eta.current_location.status == "departed"
                or train_eta.current_location.sequence > 1
                or (first_stop and first_stop.status == "departed")
            )
            if has_departed:
                notif = Notification(
                    watched_journey_id=journey.id,
                    user_id=journey.user_id,
                    session_id=journey.session_id,
                    train_number=journey.train_number,
                    notification_type="departure",
                    severity="info",
                    title=f"🚆 Train {journey.train_number} Departed",
                    message=(
                        f"Train {journey.train_number} has departed from "
                        f"{journey.origin_station or first_stop.station_name if first_stop else 'origin'}."
                    ),
                    created_at=now,
                )
                db.add(notif)
                generated.append(notif)
                journey.has_departed = True

        # -------------------------------------------------------------
        # 2. Significant Delay Alert (Anti-spam: only on >=5 min jump)
        # -------------------------------------------------------------
        if journey.notify_significant_delay:
            threshold = float(journey.delay_threshold_mins)
            prev_delay = float(journey.last_known_delay or 0.0)

            # Check if delay crosses threshold and is newly exceeded or grew by >= 5m
            is_new_threshold_cross = (prev_delay < threshold and curr_delay >= threshold)
            is_significant_increase = (curr_delay >= threshold and curr_delay >= (prev_delay + 5.0))

            if is_new_threshold_cross or is_significant_increase:
                severity = "moderate" if curr_delay <= 45.0 else "major"
                notif = Notification(
                    watched_journey_id=journey.id,
                    user_id=journey.user_id,
                    session_id=journey.session_id,
                    train_number=journey.train_number,
                    notification_type="delay",
                    severity=severity,
                    title="⚠️ Significant Delay Alert",
                    message=(
                        f"Train {journey.train_number} is currently running with a {round(curr_delay)} minute delay."
                        f" (Threshold: {journey.delay_threshold_mins}m)"
                    ),
                    created_at=now,
                )
                db.add(notif)
                generated.append(notif)
                journey.last_known_delay = curr_delay

        # -------------------------------------------------------------
        # 3. ETA Changed Significantly (Anti-spam: delta >= eta_threshold_mins)
        # -------------------------------------------------------------
        if journey.notify_eta_changed and target_eta:
            old_eta_str = journey.last_known_eta
            if old_eta_str and old_eta_str != target_eta:
                # Compare time difference
                delta_mins = self._calculate_time_delta_mins(old_eta_str, target_eta)
                if abs(delta_mins) >= float(journey.eta_threshold_mins):
                    direction = "later" if delta_mins > 0 else "earlier"
                    notif = Notification(
                        watched_journey_id=journey.id,
                        user_id=journey.user_id,
                        session_id=journey.session_id,
                        train_number=journey.train_number,
                        notification_type="eta_change",
                        severity="minor" if abs(delta_mins) < 20 else "moderate",
                        title="🕒 ETA Updated",
                        message=(
                            f"Predicted ETA for {target_name} updated to "
                            f"{self._format_time_display(target_eta)} ({abs(round(delta_mins))} min {direction})."
                        ),
                        created_at=now,
                    )
                    db.add(notif)
                    generated.append(notif)
                    journey.last_known_eta = target_eta
            elif not old_eta_str:
                journey.last_known_eta = target_eta

        # -------------------------------------------------------------
        # 4. Major Delay Severity Tier Change
        # -------------------------------------------------------------
        if journey.notify_delay_severity:
            curr_tier = get_severity_tier(curr_delay)
            prev_tier = journey.last_severity_tier or "on_time"

            if curr_tier != prev_tier:
                tier_label = SEVERITY_LABELS.get(curr_tier, curr_tier)
                notif = Notification(
                    watched_journey_id=journey.id,
                    user_id=journey.user_id,
                    session_id=journey.session_id,
                    train_number=journey.train_number,
                    notification_type="severity",
                    severity=curr_tier if curr_tier in ("minor", "moderate", "major") else "info",
                    title=f"{tier_label} Status",
                    message=(
                        f"Delay severity tier changed to {tier_label} for Train {journey.train_number} "
                        f"({round(curr_delay)} min delay)."
                    ),
                    created_at=now,
                )
                db.add(notif)
                generated.append(notif)
                journey.last_severity_tier = curr_tier

        # -------------------------------------------------------------
        # 5. Approaching Destination / Target Station
        # -------------------------------------------------------------
        if journey.notify_approaching and not journey.has_approached and target_stop:
            is_approaching = False
            proximity_desc = ""

            # Case A: Location permission granted and coordinates provided
            if (
                user_lat is not None
                and user_lng is not None
                and target_stop.lat is not None
                and target_stop.lng is not None
            ):
                dist_km = haversine_distance_km(user_lat, user_lng, target_stop.lat, target_stop.lng)
                if dist_km <= float(journey.approaching_distance_km):
                    is_approaching = True
                    proximity_desc = f"GPS proximity: {round(dist_km, 1)} km away"

            # Case B: Location not granted - fallback to train sequence or time estimation
            if not is_approaching:
                curr_seq = int(train_eta.current_location.sequence)
                target_seq = int(target_stop.sequence)

                # If train is 1 stop away or at target stop
                if target_seq > 0 and (target_seq - curr_seq <= 1):
                    is_approaching = True
                    proximity_desc = "Next stop on the route"

            if is_approaching:
                notif = Notification(
                    watched_journey_id=journey.id,
                    user_id=journey.user_id,
                    session_id=journey.session_id,
                    train_number=journey.train_number,
                    notification_type="approaching",
                    severity="major",
                    title=f"📍 Approaching {target_name}",
                    message=(
                        f"Train {journey.train_number} is approaching {target_name} ({proximity_desc}). "
                        f"Please get ready for arrival."
                    ),
                    created_at=now,
                )
                db.add(notif)
                generated.append(notif)
                journey.has_approached = True

        # -------------------------------------------------------------
        # 6. Platform Change Alert (ONLY if platform data exists)
        # -------------------------------------------------------------
        if journey.notify_platform and target_platform:
            old_platform = journey.last_known_platform
            if old_platform and old_platform != target_platform:
                notif = Notification(
                    watched_journey_id=journey.id,
                    user_id=journey.user_id,
                    session_id=journey.session_id,
                    train_number=journey.train_number,
                    notification_type="platform",
                    severity="moderate",
                    title="🛤 Platform Update",
                    message=(
                        f"Platform for {target_name} on Train {journey.train_number} "
                        f"changed from Platform {old_platform} to Platform {target_platform}."
                    ),
                    created_at=now,
                )
                db.add(notif)
                generated.append(notif)
                journey.last_known_platform = target_platform
            elif not old_platform:
                journey.last_known_platform = target_platform

        journey.last_known_delay = curr_delay
        journey.updated_at = now
        return generated

    def _calculate_time_delta_mins(self, time_str1: str, time_str2: str) -> float:
        """Calculate difference in minutes between two timestamps (ISO or HH:MM)."""
        try:
            # Handle ISO format
            if "T" in time_str1 and "T" in time_str2:
                dt1 = datetime.datetime.fromisoformat(time_str1)
                dt2 = datetime.datetime.fromisoformat(time_str2)
                return (dt2 - dt1).total_seconds() / 60.0

            # Handle HH:MM
            if ":" in time_str1 and ":" in time_str2:
                h1, m1 = map(int, time_str1[:5].split(":"))
                h2, m2 = map(int, time_str2[:5].split(":"))
                mins1 = h1 * 60 + m1
                mins2 = h2 * 60 + m2
                diff = mins2 - mins1
                if diff < -720:  # Crossed midnight
                    diff += 1440
                elif diff > 720:
                    diff -= 1440
                return float(diff)
        except Exception:
            pass
        return 0.0

    def _format_time_display(self, time_str: Optional[str]) -> str:
        """Format timestamp into HH:MM display format."""
        if not time_str:
            return "--"
        if "T" in time_str:
            try:
                dt = datetime.datetime.fromisoformat(time_str)
                return dt.strftime("%H:%M")
            except Exception:
                pass
        return str(time_str)[:5]


notification_service = NotificationService()
