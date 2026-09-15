from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.ai import QuestionIntent
from app.models.user import User
from app.schemas.questions import (
    QuestionAnswerRequest,
    QuestionAnswerResult,
    QuestionClassifyRequest,
    QuestionClassifyResult,
)
from app.services.ai_service import AiService, build_provider
from app.services.answer_engine import AnswerEngine, fingerprint
from app.services.question_classifier import classify_question, normalize_question_text

router = APIRouter()


def get_ai_service() -> AiService:
    """Resolve the configured AI provider and wrap it in the answer service."""
    from app.core.config import settings

    provider = build_provider(
        settings.ai_provider, api_key=settings.groq_api_key, model=settings.ai_model
    )
    return AiService(
        provider,
        max_output_tokens=settings.ai_max_output_tokens,
        timeout_seconds=settings.ai_timeout_seconds,
    )


@router.post("/classify", response_model=QuestionClassifyResult)
async def classify_question_endpoint(
    payload: QuestionClassifyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QuestionClassifyResult:
    classification = classify_question(payload.question)
    normalized = normalize_question_text(payload.question)
    question_fingerprint = fingerprint(payload.question)

    cached = await db.scalar(
        select(QuestionIntent).where(
            QuestionIntent.user_id == current_user.id,
            QuestionIntent.question_fingerprint == question_fingerprint,
        )
    )
    if cached is None:
        cached = QuestionIntent(
            user_id=current_user.id,
            question_fingerprint=question_fingerprint,
            normalized_question=normalized,
            intent=str(classification.intent),
            confidence=classification.confidence,
            skill_hint=classification.skill_hint,
        )
        db.add(cached)
    else:
        cached.normalized_question = normalized
        cached.intent = str(classification.intent)
        cached.confidence = classification.confidence
        cached.skill_hint = classification.skill_hint
    await db.commit()

    return QuestionClassifyResult(
        question=payload.question,
        normalized_question=normalized,
        intent=str(classification.intent),
        confidence=classification.confidence,
        skill_hint=classification.skill_hint,
    )


@router.post("/answer", response_model=QuestionAnswerResult)
async def answer_question_endpoint(
    payload: QuestionAnswerRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    ai_service: Annotated[AiService, Depends(get_ai_service)],
) -> QuestionAnswerResult:
    engine = AnswerEngine(ai_service)
    resolution = await engine.resolve(
        db=db,
        user_id=current_user.id,
        question=payload.question,
        profile=payload.relevant_profile.model_dump() if payload.relevant_profile else None,
        job_context=(
            payload.relevant_job_context.model_dump(exclude_none=True)
            if payload.relevant_job_context
            else None
        ),
        conversation=(
            [turn.model_dump() for turn in payload.relevant_conversation_context]
            if payload.relevant_conversation_context
            else None
        ),
    )
    await db.commit()
    return QuestionAnswerResult(
        answer=resolution.answer,
        confidence=resolution.confidence,
        requires_user_confirmation=resolution.requires_user_confirmation,
        reason=resolution.reason,
        answer_source=resolution.answer_source,
        intent=str(resolution.intent),
        was_ai_generated=resolution.was_ai_generated,
    )