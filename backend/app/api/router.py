from fastapi import APIRouter

from app.api import admin, auth, comms, markets, missions, players, ships, stations
from app.api import story, systems

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(players.router, prefix="/players", tags=["players"])
router.include_router(ships.router, prefix="/ships", tags=["ships"])
router.include_router(systems.router, prefix="/systems", tags=["systems"])
router.include_router(stations.router, prefix="/stations", tags=["stations"])
router.include_router(markets.router, prefix="/markets", tags=["markets"])
router.include_router(missions.router, prefix="/missions", tags=["missions"])
router.include_router(story.router, prefix="/story", tags=["story"])
router.include_router(comms.router, prefix="/comms", tags=["comms"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])
