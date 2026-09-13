from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from src.api.deps import get_optional_current_user
from src.db.models import User
from src.db.session import get_db
from src.schemas.common import ApiResponse
from src.schemas.notification import (
    EvaluateNotificationsRequest,
    NotificationResponse,
    NotificationSummaryResponse,
    WatchedJourneyResponse,
    WatchJourneyRequest,
)
from src.services.notification_service import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/watch", response_model=ApiResponse[WatchedJourneyResponse])
async def watch_train_journey(
    request: WatchJourneyRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[WatchedJourneyResponse]:
    """Watch a train journey and configure dynamic notification triggers."""
    watched = notification_service.watch_journey(db, request, user)
    return ApiResponse(
        success=True,
        data=WatchedJourneyResponse.model_validate(watched),
        message=f"Now watching train {watched.train_number}",
    )


@router.get("/watched", response_model=ApiResponse[List[WatchedJourneyResponse]])
async def list_watched_journeys(
    session_id: Optional[str] = Query(None, description="Session ID for guest passengers"),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[List[WatchedJourneyResponse]]:
    """List all active watched journeys for the passenger."""
    watched_list = notification_service.get_watched_journeys(db, user, session_id)
    return ApiResponse(
        success=True,
        data=[WatchedJourneyResponse.model_validate(w) for w in watched_list],
    )


@router.delete("/watched/{watched_id}", response_model=ApiResponse[bool])
async def unwatch_train_journey(
    watched_id: int,
    session_id: Optional[str] = Query(None, description="Session ID for guest passengers"),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[bool]:
    """Stop watching a train journey."""
    success = notification_service.unwatch_journey(db, watched_id, user, session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watched journey not found or already cancelled",
        )
    return ApiResponse(
        success=True,
        data=True,
        message="Journey removed from watch list",
    )


@router.get("", response_model=ApiResponse[NotificationSummaryResponse])
async def get_notification_history(
    session_id: Optional[str] = Query(None, description="Session ID for guest passengers"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[NotificationSummaryResponse]:
    """Fetch notifications and unread badge count for the passenger."""
    summary = notification_service.get_notifications(db, user, session_id, limit=limit)
    return ApiResponse(
        success=True,
        data=summary,
    )


@router.put("/{notification_id}/read", response_model=ApiResponse[bool])
async def mark_notification_as_read(
    notification_id: int,
    session_id: Optional[str] = Query(None, description="Session ID for guest passengers"),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[bool]:
    """Mark a single notification as read."""
    success = notification_service.mark_as_read(db, notification_id, user, session_id)
    return ApiResponse(
        success=True,
        data=success,
    )


@router.put("/read-all", response_model=ApiResponse[int])
async def mark_all_notifications_as_read(
    session_id: Optional[str] = Query(None, description="Session ID for guest passengers"),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[int]:
    """Mark all notifications as read for current passenger."""
    count = notification_service.mark_all_as_read(db, user, session_id)
    return ApiResponse(
        success=True,
        data=count,
        message=f"Marked {count} notifications as read",
    )


@router.post("/evaluate", response_model=ApiResponse[List[NotificationResponse]])
async def evaluate_notifications(
    payload: EvaluateNotificationsRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_current_user),
) -> ApiResponse[List[NotificationResponse]]:
    """Evaluate active watched journeys against latest dynamic train telemetry and generate notifications."""
    session_id = payload.session_id
    new_notifs = await notification_service.evaluate_watched_journeys(
        db=db,
        user=user,
        session_id=session_id,
        user_lat=payload.user_lat,
        user_lng=payload.user_lng,
    )
    return ApiResponse(
        success=True,
        data=[NotificationResponse.model_validate(n) for n in new_notifs],
        message=f"Generated {len(new_notifs)} new notifications",
    )
