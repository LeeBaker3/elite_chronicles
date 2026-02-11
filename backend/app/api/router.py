from fastapi import APIRouter

from app.api import auth, ships, stations, story

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(ships.router, prefix="/ships", tags=["ships"])
router.include_router(stations.router, prefix="/stations", tags=["stations"])
router.include_router(story.router, prefix="/story", tags=["story"])
