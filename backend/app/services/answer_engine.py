"""Deterministic-first answer engine with an AI fallback.

Resolution order follows the PRD §6 hierarchy: PROFILE → RULE → CACHE → DERIVED →
AI. AI is used only for complex / free-text / unknown questions, never for
sensitive or profile-fact questions. AI output always requires user confirmation,
and the AI service is the only component that can produce `source=AI` answers.
"""

import hashlib
import re
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai import AiUsage, QuestionCache
from app.services.ai_service import AiService, build_minimal_context
from app.services.form_intents import AnswerSource, FieldIntent
from app.services.question_classifier import classify_question

AI_ELIGIBLE_INTENTS = frozenset({FieldIntent.FREE_TEXT, FieldIntent.UNKNOWN})
SENSITIVE_INTENTS = frozenset(
    {
        FieldIntent.SALARY_CURRENT,
        FieldIntent.SALARY_EXPECTED,
        FieldIntent.WORK_AUTHORIZATION,
    }
)

LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.6
PURPOSE_QUESTION_ANSWER = "question_answer"

# Demographic / legal / personal-data questions must never reach the AI model,
# even when the classifier cannot map them to a known intent.
_SENSITIVE_QUESTION_PATTERNS = (
    r"visa status",
    r"work authorization",
    r"work authorisation",
    r"authorization to work",
    r"authorisation to work",
    r"authorized to work",
    r"authorised to work",
    r"lawfully authorized",
    r"legally authorized",
    r"lawfully authorised",
    r"legally authorised",
    r"right to work",
    r"eligible to work",
    r"work permit",
    r"sponsorship",
    r"h1b",
    r"h-1b",
    r"disability",
    r"accommodat",
    r"criminal",
    r"felony",
    r"conviction",
    r"arrest",
    r"legal record",
    r"\brace\b",
    r"ethnicity",
    r"\bethnic\b",
    r"\bgender\b",
    r"\bsex\b",
    r"\bmarital\b",
    r"\breligion\b",
    r"\breligious\b",
    r"\bpolitical\b",
    r"date of birth",
    r"\bage\b",
    r"\bcitizenship\b",
    r"national origin",
    r"sexual orientation",
)

_SENSITIVE_PATTERN = re.compile("|".join(_SENSITIVE_QUESTION_PATTERNS), re.IGNORECASE)


@dataclass(frozen=True)
class AnswerResolution:
    answer: str | None
    answer_source: AnswerSource | None
    confidence: float
    requires_user_confirmation: bool
    reason: str | None
    intent: FieldIntent
    was_ai_generated: bool


@dataclass(frozen=True)
class _Deterministic:
    kind: str
    value: str | None = None
    source: AnswerSource | None = None
    reason: str | None = None


def fingerprint(question: str) -> str:
    from app.services.question_classifier import normalize_question_text

    normalized = normalize_question_text(question)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:40]


def is_sensitive_question(question: str) -> bool:
    return _SENSITIVE_PATTERN.search(question) is not None


def normalize_skill(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+#.]", " ", value.lower())).strip()


def find_skill(profile: Mapping[str, Any], hint: str | None) -> Mapping[str, Any] | None:
    if not hint:
        return None
    target = normalize_skill(hint)
    if len(target) == 0:
        return None
    for skill in profile.get("skills") or []:
        name = normalize_skill(str((skill or {}).get("name") or ""))
        if len(name) == 0:
            continue
        if name == target or (len(target) >= 3 and (name in target or target in name)):
            return skill
    return None


def _blocked(reason: str) -> _Deterministic:
    return _Deterministic("blocked", reason=reason)


def _answer(value: str, source: AnswerSource) -> _Deterministic:
    return _Deterministic("answer", value=value, source=source)


def _skip(reason: str) -> _Deterministic:
    return _Deterministic("skip", reason=reason)


def _from_field(value: str | None, intent: FieldIntent) -> _Deterministic:
    if not value or not value.strip():
        return _blocked(f'No value in your confirmed profile. Fill "{intent}" manually.')
    return _answer(value.strip(), AnswerSource.PROFILE)


def _preference_flag(value: bool | None) -> _Deterministic:
    if value is None:
        return _blocked(
            "This is answered from your profile preference. It is not set — answer "
            "manually (or set it in Profile > Preferences)."
        )
    return _answer("Yes" if value else "No", AnswerSource.PROFILE)


def _split_name(full_name: str) -> tuple[str | None, str | None]:
    parts = full_name.strip().split()
    if not parts:
        return None, None
    return parts[0], " ".join(parts[1:]) if len(parts) > 1 else None


def propose_profile_value(intent: FieldIntent, profile: Mapping[str, Any]) -> _Deterministic:
    """Port of the extension's `profile-mapper.ts` into the backend engine."""
    preferences = profile.get("preferences") or {}

    if intent in (FieldIntent.FULL_NAME, FieldIntent.NAME):
        return _from_field(profile.get("full_name"), intent)
    if intent in (FieldIntent.FIRST_NAME, FieldIntent.LAST_NAME):
        first, last = _split_name(str(profile.get("full_name") or ""))
        value = first if intent == FieldIntent.FIRST_NAME else last
        if not value:
            return _blocked("Your full name in the profile cannot be split into a first/last name.")
        return _answer(value, AnswerSource.DERIVED)
    if intent == FieldIntent.EMAIL:
        return _from_field(profile.get("email"), intent)
    if intent == FieldIntent.PHONE:
        return _from_field(profile.get("phone"), intent)
    if intent in (FieldIntent.LOCATION, FieldIntent.CITY):
        return _from_field(profile.get("location"), intent)
    if intent == FieldIntent.CURRENT_COMPANY:
        employer = (profile.get("experience") or [{}])[0].get("employer")
        if employer:
            return _answer(employer, AnswerSource.PROFILE)
        return _blocked('No employer in your confirmed profile. Fill "Current company" manually.')
    if intent == FieldIntent.JOB_TITLE:
        role = profile.get("current_role") or (profile.get("experience") or [{}])[0].get("job_title")
        if role:
            source = AnswerSource.PROFILE if profile.get("current_role") else AnswerSource.DERIVED
            return _answer(role, source)
        return _blocked('No job title in your confirmed profile. Fill "Job title" manually.')
    if intent == FieldIntent.TOTAL_EXPERIENCE:
        years = profile.get("total_experience")
        if years is None:
            return _blocked("Total experience is not set in your confirmed profile.")
        return _answer(str(years), AnswerSource.PROFILE)
    if intent in (FieldIntent.SKILLS, FieldIntent.SKILL_LIST):
        skills = [str(skill.get("name")) for skill in profile.get("skills") or [] if skill.get("name")]
        if not skills:
            return _blocked("No skills in your confirmed profile.")
        return _answer(", ".join(skills), AnswerSource.PROFILE)
    if intent == FieldIntent.DEGREE:
        degree = (profile.get("education") or [{}])[0].get("degree")
        if degree:
            return _answer(degree, AnswerSource.DERIVED)
        return _blocked('No education entry in your confirmed profile. Fill "Education" manually.')
    if intent == FieldIntent.EDUCATION:
        entries = [
            entry
            for entry in profile.get("education") or []
            if entry.get("degree") or entry.get("institution")
        ]
        if not entries:
            return _blocked('No education in your confirmed profile. Fill "Education" manually.')
        value = "; ".join(
            ", ".join(str(part).strip() for part in (entry.get("degree"), entry.get("institution")) if part)
            for entry in entries
        )
        return _answer(value, AnswerSource.DERIVED)
    if intent == FieldIntent.EDUCATION_LEVEL:
        degree = (profile.get("education") or [{}])[0].get("degree")
        if degree:
            return _answer(degree, AnswerSource.DERIVED)
        return _blocked('No education entry in your confirmed profile. Fill "Education" manually.')
    if intent == FieldIntent.CERTIFICATION:
        certifications = [item.strip() for item in profile.get("certifications") or [] if item.strip()]
        if not certifications:
            return _blocked("No certifications in your confirmed profile.")
        return _answer(", ".join(certifications), AnswerSource.PROFILE)
    if intent == FieldIntent.NOTICE_PERIOD:
        notice = preferences.get("notice_period")
        if not notice or not str(notice).strip():
            return _blocked("Notice period is not set in your profile preferences.")
        return _answer(str(notice).strip(), AnswerSource.PROFILE)
    if intent == FieldIntent.SALARY_CURRENT:
        salary = preferences.get("current_salary")
        if salary is None:
            return _blocked(
                "Current salary is not configured — this is sensitive; answer it manually "
                "or set it in Profile > Preferences."
            )
        return _answer(str(salary), AnswerSource.PROFILE)
    if intent == FieldIntent.SALARY_EXPECTED:
        salary = preferences.get("expected_salary")
        if salary is None:
            return _blocked(
                "Expected salary is not configured — this is sensitive; answer it manually "
                "or set it in Profile > Preferences."
            )
        return _answer(str(salary), AnswerSource.PROFILE)
    if intent == FieldIntent.WORK_AUTHORIZATION:
        authorization = profile.get("work_authorization")
        if authorization and str(authorization).strip():
            return _answer(str(authorization).strip(), AnswerSource.PROFILE)
        return _blocked(
            "Work authorization / visa is sensitive. It is not set in your profile — answer manually."
        )
    if intent == FieldIntent.AVAILABILITY:
        notice = preferences.get("notice_period")
        if notice and str(notice).strip():
            return _answer(str(notice).strip(), AnswerSource.PROFILE)
        return _blocked("Availability is not determinable from your profile — answer manually.")
    if intent == FieldIntent.RELOCATION:
        return _preference_flag(preferences.get("relocation_preference"))
    if intent == FieldIntent.REMOTE_WORK:
        return _preference_flag(preferences.get("remote_preference"))
    if intent in (FieldIntent.SKILL_BOOLEAN, FieldIntent.SKILL_EXPERIENCE, FieldIntent.FREE_TEXT):
        return _blocked("Not determinable from the profile alone.")
    return _skip("Field intent not recognized; not auto-filled.")


class AnswerEngine:
    def __init__(self, ai_service: AiService) -> None:
        self._ai_service = ai_service

    async def _cached_answer(
        self, db: AsyncSession, user_id: uuid.UUID, question: str, intent: FieldIntent
    ) -> AnswerResolution | None:
        row = await db.scalar(
            select(QuestionCache).where(
                QuestionCache.user_id == user_id,
                QuestionCache.question_fingerprint == fingerprint(question),
            )
        )
        if row is None or not row.was_ai_generated or row.intent != str(intent):
            return None
        return AnswerResolution(
            answer=row.answer,
            answer_source=AnswerSource.CACHE,
            confidence=row.confidence,
            requires_user_confirmation=row.requires_user_confirmation,
            reason=None,
            intent=intent,
            was_ai_generated=True,
        )

    async def _balance_remaining(self, db: AsyncSession, user_id: uuid.UUID) -> bool:
        start_of_day = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        count = await db.scalar(
            select(func.count(AiUsage.id)).where(
                AiUsage.user_id == user_id, AiUsage.created_at >= start_of_day
            )
        )
        return (count or 0) < settings.ai_max_calls_per_day

    async def _record_usage(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        usage: Any,
        success: bool,
        error: str | None,
    ) -> None:
        db.add(
            AiUsage(
                user_id=user_id,
                provider=self._ai_service.provider_name,
                model=self._ai_service.model_name,
                purpose=PURPOSE_QUESTION_ANSWER,
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                latency_ms=usage.latency_ms,
                success=success,
                error=(error or "")[:500] or None,
            )
        )

    async def _ai_fallback(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        question: str,
        intent: FieldIntent,
        profile: Mapping[str, Any] | None,
        job_context: Mapping[str, Any] | None,
        conversation: list[Mapping[str, Any]] | None,
    ) -> AnswerResolution:
        cached = await self._cached_answer(db, user_id, question, intent)
        if cached is not None:
            return cached

        if not await self._balance_remaining(db, user_id):
            return AnswerResolution(
                answer=None,
                answer_source=None,
                confidence=0.0,
                requires_user_confirmation=True,
                reason="AI answer budget exhausted for today — answer this manually.",
                intent=intent,
                was_ai_generated=False,
            )

        context = build_minimal_context(
            profile=profile, job_context=job_context, conversation=conversation
        )
        result = await self._ai_service.generate(question, context=context)
        success = result.error is None
        await self._record_usage(
            db, user_id, usage=result.usage, success=success, error=result.error
        )

        if result.error is not None:
            return AnswerResolution(
                answer=None,
                answer_source=None,
                confidence=0.0,
                requires_user_confirmation=True,
                reason="The AI answer engine could not produce an answer. Compose it manually.",
                intent=intent,
                was_ai_generated=False,
            )

        ai_answer = result.answer
        assert ai_answer is not None
        db.add(
            QuestionCache(
                user_id=user_id,
                question_fingerprint=fingerprint(question),
                normalized_question=question,
                intent=str(intent),
                answer=ai_answer.answer,
                answer_source=AnswerSource.AI.value,
                confidence=ai_answer.confidence,
                was_ai_generated=True,
                requires_user_confirmation=True,
            )
        )
        return AnswerResolution(
            answer=ai_answer.answer,
            answer_source=AnswerSource.AI,
            confidence=ai_answer.confidence,
            requires_user_confirmation=True,
            reason=ai_answer.reason,
            intent=intent,
            was_ai_generated=True,
        )

    async def resolve(
        self,
        *,
        db: AsyncSession,
        user_id: uuid.UUID,
        question: str,
        profile: Mapping[str, Any] | None,
        job_context: Mapping[str, Any] | None = None,
        conversation: list[Mapping[str, Any]] | None = None,
    ) -> AnswerResolution:
        classification = classify_question(question)
        intent = classification.intent
        confidence = classification.confidence

        if profile is None:
            return AnswerResolution(
                answer=None,
                answer_source=None,
                confidence=0.0,
                requires_user_confirmation=True,
                reason="No confirmed profile — nothing will be auto-answered.",
                intent=intent,
                was_ai_generated=False,
            )

        if intent in SENSITIVE_INTENTS:
            proposal = propose_profile_value(intent, profile)
            if proposal.kind == "answer":
                return AnswerResolution(
                    answer=proposal.value,
                    answer_source=proposal.source,
                    confidence=confidence,
                    requires_user_confirmation=True,
                    reason="Sensitive question — confirm this answer before sending.",
                    intent=intent,
                    was_ai_generated=False,
                )
            return AnswerResolution(
                answer=None,
                answer_source=None,
                confidence=confidence,
                requires_user_confirmation=True,
                reason=proposal.reason or "Sensitive question — answer it manually.",
                intent=intent,
                was_ai_generated=False,
            )

        if is_sensitive_question(question):
            return AnswerResolution(
                answer=None,
                answer_source=None,
                confidence=confidence,
                requires_user_confirmation=True,
                reason="This question asks for personal or legally protected information — answer it manually.",
                intent=intent,
                was_ai_generated=False,
            )

        if intent == FieldIntent.SKILL_BOOLEAN:
            skill = find_skill(profile, classification.skill_hint)
            if skill is not None:
                return AnswerResolution(
                    answer="Yes",
                    answer_source=AnswerSource.PROFILE,
                    confidence=0.9,
                    requires_user_confirmation=False,
                    reason=None,
                    intent=intent,
                    was_ai_generated=False,
                )
            return AnswerResolution(
                answer="No",
                answer_source=AnswerSource.PROFILE,
                confidence=0.9,
                requires_user_confirmation=True,
                reason="That skill is not listed in your confirmed profile — confirm this answer before sending.",
                intent=intent,
                was_ai_generated=False,
            )

        if intent == FieldIntent.SKILL_EXPERIENCE:
            skill = find_skill(profile, classification.skill_hint)
            if skill is None:
                return AnswerResolution(
                    answer=None,
                    answer_source=None,
                    confidence=0.9,
                    requires_user_confirmation=True,
                    reason="That skill is not in your confirmed profile. Answer it manually.",
                    intent=intent,
                    was_ai_generated=False,
                )
            years = skill.get("experience")
            if years is None:
                return AnswerResolution(
                    answer=None,
                    answer_source=None,
                    confidence=0.9,
                    requires_user_confirmation=True,
                    reason="Years for that skill are not recorded in your confirmed profile.",
                    intent=intent,
                    was_ai_generated=False,
                )
            return AnswerResolution(
                answer=f"{years} years",
                answer_source=AnswerSource.PROFILE,
                confidence=0.9,
                requires_user_confirmation=False,
                reason=None,
                intent=intent,
                was_ai_generated=False,
            )

        proposal = propose_profile_value(intent, profile)
        if proposal.kind == "answer":
            requires_confirmation = confidence > 0 and confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD
            return AnswerResolution(
                answer=proposal.value,
                answer_source=proposal.source,
                confidence=confidence,
                requires_user_confirmation=requires_confirmation,
                reason=(
                    "Question was classified with low confidence — confirm before sending."
                    if requires_confirmation
                    else None
                ),
                intent=intent,
                was_ai_generated=False,
            )

        if intent in AI_ELIGIBLE_INTENTS:
            return await self._ai_fallback(
                db,
                user_id,
                question,
                intent,
                profile,
                job_context,
                conversation,
            )

        if proposal.kind == "blocked":
            return AnswerResolution(
                answer=None,
                answer_source=None,
                confidence=confidence,
                requires_user_confirmation=True,
                reason=proposal.reason,
                intent=intent,
                was_ai_generated=False,
            )

        return AnswerResolution(
            answer=None,
            answer_source=None,
            confidence=confidence,
            requires_user_confirmation=True,
            reason=proposal.reason,
            intent=intent,
            was_ai_generated=False,
        )