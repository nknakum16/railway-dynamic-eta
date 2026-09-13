from fastapi import APIRouter
from src.api.v1.endpoints import (
    auth,
    eta,
    health,
    journey,
    lookup,
    notification,
    predict,
    trains,
)

api_v1_router = APIRouter()

# Register endpoint routers
api_v1_router.include_router(health.router, tags=["System Health"])
api_v1_router.include_router(auth.router, tags=["Authentication"])
api_v1_router.include_router(journey.router, tags=["Journey & Alarms"])
api_v1_router.include_router(notification.router, tags=["Smart Notifications"])
api_v1_router.include_router(eta.router, tags=["Dynamic ETA"])
api_v1_router.include_router(trains.router, tags=["Trains & Live Telemetry"])
api_v1_router.include_router(predict.router, tags=["ML Inference"])
api_v1_router.include_router(lookup.router, tags=["Train & Station Lookups"])


