from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.ai import AiUsage
from app.models.user import User
from app.schemas.ai_usage import AiUsageSummary

router = APIRouter()


@router.get("/ai", response_model=AiUsageSummary)
async def ai_usage_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AiUsageSummary:
    rows = (
        await db.scalars(
            select(AiUsage).where(AiUsage.user_id == current_user.id).order_by(AiUsage.created_at)
        )
    ).all()

    summary = AiUsageSummary(
        total_calls=len(rows),
        ai_generated_answers=sum(1 for row in rows if row.success),
        failed_calls=sum(1 for row in rows if not row.success),
        prompt_tokens=sum(row.prompt_tokens for row in rows),
        completion_tokens=sum(row.completion_tokens for row in rows),
        total_tokens=sum(row.total_tokens for row in rows),
    )
    if rows:
        summary.average_latency_ms = round(
            sum(row.latency_ms for row in rows) / len(rows), 1
        )
        summary.last_used_at = rows[-1].created_at
    return summary