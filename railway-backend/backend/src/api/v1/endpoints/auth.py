from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db
from src.core.config import settings
from src.core.security import create_access_token, hash_password, verify_password
from src.db.models import User
from src.schemas.auth import TokenResponse, UserLoginRequest, UserResponse, UserSignupRequest
from src.schemas.common import ApiResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=ApiResponse[TokenResponse], status_code=status.HTTP_201_CREATED)
def signup(
    payload: UserSignupRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    """Register a new user account with email and password."""
    email_clean = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    user = User(
        email=email_clean,
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return ApiResponse(
        success=True,
        message="Account created successfully",
        data=TokenResponse(
            access_token=token,
            user=UserResponse.model_validate(user),
        ),
    )


@router.post("/login", response_model=ApiResponse[TokenResponse])
def login(
    payload: UserLoginRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[TokenResponse]:
    """Authenticate user with email and password and return a JWT access token."""
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email address or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return ApiResponse(
        success=True,
        message="Login successful",
        data=TokenResponse(
            access_token=token,
            user=UserResponse.model_validate(user),
        ),
    )


@router.get("/me", response_model=ApiResponse[UserResponse])
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
) -> ApiResponse[UserResponse]:
    """Retrieve profile of the currently authenticated user."""
    return ApiResponse(
        success=True,
        data=UserResponse.model_validate(current_user),
    )
