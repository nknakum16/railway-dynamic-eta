from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from src.core.security import decode_access_token
from src.db.models import User
from src.db.session import get_db
from src.services.eta_service import ETAService, eta_service
from src.services.model_service import ModelManager, model_manager
from src.services.railradar_client import RailRadarClient, railradar_client

security_bearer = HTTPBearer(auto_error=True)
optional_security_bearer = HTTPBearer(auto_error=False)


def get_railradar_client() -> RailRadarClient:
    """Dependency provider for RailRadar client."""
    return railradar_client


def get_eta_service() -> ETAService:
    """Dependency provider for dynamic ETA service."""
    return eta_service


def get_model_manager() -> ModelManager:
    """Dependency provider for ML model manager."""
    return model_manager


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Retrieve currently authenticated user from Bearer JWT token."""
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload["sub"]
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Retrieve user if token is provided, or None if guest request."""
    if not credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        if payload and "sub" in payload:
            return db.query(User).filter(User.id == int(payload["sub"])).first()
    except Exception:
        pass
    return None
