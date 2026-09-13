import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from src.api.deps import get_db, get_optional_current_user
from src.db.models import JourneyAlarm, User
from src.schemas.common import ApiResponse
from src.schemas.journey import AlarmResponse, CreateAlarmRequest, UpdateAlarmStatusRequest

router = APIRouter(prefix="/journey", tags=["Journey & Alarms"])


@router.post("/alarm", response_model=ApiResponse[AlarmResponse], status_code=status.HTTP_201_CREATED)
def create_journey_alarm(
    payload: CreateAlarmRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[AlarmResponse]:
    """Create and persist a destination arrival alarm for a train journey."""
    alarm = JourneyAlarm(
        user_id=current_user.id if current_user else None,
        train_number=payload.train_number.strip(),
        train_name=payload.train_name.strip() if payload.train_name else None,
        origin_station=payload.origin_station.strip() if payload.origin_station else None,
        destination_station=payload.destination_station.strip(),
        destination_code=payload.destination_code.strip().upper() if payload.destination_code else None,
        destination_lat=payload.destination_lat,
        destination_lon=payload.destination_lon,
        alarm_distance_km=payload.alarm_distance_km,
        status="active",
        is_in_train=payload.is_in_train,
        initial_user_lat=payload.initial_user_lat,
        initial_user_lon=payload.initial_user_lon,
    )
    db.add(alarm)
    db.commit()
    db.refresh(alarm)

    return ApiResponse(
        success=True,
        message="Destination arrival alarm set successfully",
        data=AlarmResponse.model_validate(alarm),
    )


@router.get("/alarms", response_model=ApiResponse[List[AlarmResponse]])
def get_user_alarms(
    status_filter: Optional[str] = Query(None, description="Optional filter by status (active, triggered, dismissed)"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[List[AlarmResponse]]:
    """Retrieve journey alarms for the current user (or recent alarms if unauthenticated)."""
    query = db.query(JourneyAlarm)

    if current_user:
        query = query.filter(JourneyAlarm.user_id == current_user.id)
    else:
        # For guest users, return the most recent active alarms
        query = query.filter(JourneyAlarm.user_id.is_(None))

    if status_filter:
        query = query.filter(JourneyAlarm.status == status_filter)

    alarms = query.order_by(JourneyAlarm.created_at.desc()).limit(50).all()

    return ApiResponse(
        success=True,
        data=[AlarmResponse.model_validate(a) for a in alarms],
    )


@router.get("/alarm/{alarm_id}", response_model=ApiResponse[AlarmResponse])
def get_alarm_by_id(
    alarm_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse[AlarmResponse]:
    """Retrieve details of a specific journey alarm."""
    alarm = db.query(JourneyAlarm).filter(JourneyAlarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journey alarm not found",
        )
    return ApiResponse(success=True, data=AlarmResponse.model_validate(alarm))


@router.put("/alarm/{alarm_id}/status", response_model=ApiResponse[AlarmResponse])
def update_alarm_status(
    alarm_id: int,
    payload: UpdateAlarmStatusRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[AlarmResponse]:
    """Update alarm status (e.g. triggered, dismissed, cancelled)."""
    alarm = db.query(JourneyAlarm).filter(JourneyAlarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journey alarm not found",
        )

    alarm.status = payload.status
    if payload.status == "triggered" and not alarm.triggered_at:
        alarm.triggered_at = datetime.datetime.now(datetime.timezone.utc)

    db.commit()
    db.refresh(alarm)

    return ApiResponse(
        success=True,
        message=f"Alarm status updated to {payload.status}",
        data=AlarmResponse.model_validate(alarm),
    )


@router.delete("/alarm/{alarm_id}", response_model=ApiResponse[dict])
def delete_alarm(
    alarm_id: int,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    """Delete a journey alarm."""
    alarm = db.query(JourneyAlarm).filter(JourneyAlarm.id == alarm_id).first()
    if not alarm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journey alarm not found",
        )
    db.delete(alarm)
    db.commit()
    return ApiResponse(success=True, message="Alarm deleted successfully")
