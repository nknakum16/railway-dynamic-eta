import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from src.db.session import Base


class User(Base):
    """User account model for authentication and journey history tracking."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(512), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc),
    )

    alarms = relationship("JourneyAlarm", back_populates="user", cascade="all, delete-orphan")
    watched_journeys = relationship("WatchedJourney", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class JourneyAlarm(Base):
    """Saved destination arrival alarm & train journey record."""

    __tablename__ = "journey_alarms"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    train_number = Column(String(20), nullable=False, index=True)
    train_name = Column(String(255), nullable=True)
    origin_station = Column(String(100), nullable=True)
    destination_station = Column(String(100), nullable=False)
    destination_code = Column(String(20), nullable=True)
    destination_lat = Column(Float, nullable=True)
    destination_lon = Column(Float, nullable=True)
    alarm_distance_km = Column(Float, default=5.0)
    status = Column(String(50), default="active", index=True)  # active, triggered, dismissed, cancelled
    is_in_train = Column(Boolean, default=True)
    initial_user_lat = Column(Float, nullable=True)
    initial_user_lon = Column(Float, nullable=True)
    created_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
    )
    triggered_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="alarms")


class WatchedJourney(Base):
    """Passenger watch subscription for dynamic trip notifications."""

    __tablename__ = "watched_journeys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)
    train_number = Column(String(20), nullable=False, index=True)
    train_name = Column(String(255), nullable=True)
    origin_station = Column(String(100), nullable=True)
    destination_station = Column(String(100), nullable=True)
    target_station_code = Column(String(20), nullable=True)
    target_station_name = Column(String(100), nullable=True)

    # Preferences
    notify_significant_delay = Column(Boolean, default=True)
    delay_threshold_mins = Column(Integer, default=15)
    notify_eta_changed = Column(Boolean, default=True)
    eta_threshold_mins = Column(Integer, default=10)
    notify_departure = Column(Boolean, default=True)
    notify_approaching = Column(Boolean, default=True)
    approaching_distance_km = Column(Float, default=10.0)
    notify_delay_severity = Column(Boolean, default=True)
    notify_platform = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True, index=True)

    # State tracking to prevent repetitive spam
    last_known_delay = Column(Float, default=0.0)
    last_known_eta = Column(String(50), nullable=True)
    last_known_platform = Column(String(20), nullable=True)
    last_severity_tier = Column(String(20), default="on_time")  # on_time, minor, moderate, major
    has_departed = Column(Boolean, default=False)
    has_approached = Column(Boolean, default=False)

    created_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc),
    )

    user = relationship("User", back_populates="watched_journeys")
    notifications = relationship("Notification", back_populates="watched_journey", cascade="all, delete-orphan")


class Notification(Base):
    """Smart notification entity generated from live trip changes."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    watched_journey_id = Column(Integer, ForeignKey("watched_journeys.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)
    train_number = Column(String(20), nullable=False, index=True)
    notification_type = Column(String(50), nullable=False, index=True)  # delay, eta_change, departure, approaching, severity, platform
    severity = Column(String(20), default="info")  # info, minor, moderate, major
    title = Column(String(255), nullable=False)
    message = Column(String(1024), nullable=False)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        index=True,
    )

    user = relationship("User", back_populates="notifications")
    watched_journey = relationship("WatchedJourney", back_populates="notifications")

