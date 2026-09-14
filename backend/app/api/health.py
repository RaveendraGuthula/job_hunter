from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database import get_db

router = APIRouter()

APP_VERSION = "0.1.0"


@router.get("/api/health", tags=["health"])
async def health(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    database = "unavailable"
    try:
        await db.execute(text("SELECT 1"))
        database = "up"
    except Exception:  # noqa: BLE001 - health probe must not fail on any DB error
        database = "unavailable"

    return {
        "status": "ok",
        "service": "job-hunter-backend",
        "version": APP_VERSION,
        "app_env": settings.app_env,
        "database": database,
    }