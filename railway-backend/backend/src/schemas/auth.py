from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class UserSignupRequest(BaseModel):
    """Payload to register a new user account."""

    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", description="User's email address")
    full_name: str = Field(..., min_length=2, max_length=100, description="User's full name")
    password: str = Field(..., min_length=6, description="Password (at least 6 characters)")


class UserLoginRequest(BaseModel):
    """Payload to authenticate an existing user."""

    email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", description="User's registered email")
    password: str = Field(..., description="User's password")


class UserResponse(BaseModel):
    """Public user profile."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    created_at: datetime


class TokenResponse(BaseModel):
    """Authentication token response upon login/signup."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
