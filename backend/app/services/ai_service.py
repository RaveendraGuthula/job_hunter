"""AI answer generation service.

Builds a deliberately minimal prompt from *confirmed* profile facts (never a full
resume), calls the configured provider, parses and validates the JSON response,
and reports token/latency usage for the `ai_usage` ledger.
"""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.services.ai_provider import AIProvider, GroqProvider, ProviderResponse

_MAX_ANSWER_LENGTH = 2000
_MAX_OUTPUT_TOKENS = 500
_TIMEOUT_SECONDS = 30.0

_SYSTEM_PROMPT = (
    "You are the AI answer engine for a job-application copilot. Draft a short, "
    "professional answer to the recruiter's question using ONLY the confirmed profile "
    "facts supplied below. Never invent skills, employers, education, certifications, "
    "salary, work authorization, location, or any other fact that is not stated in the "
    "reference context. When the question is open-ended (for example 'tell us about "
    "yourself'), summarize the provided facts. If the provided facts are not enough to "
    "answer, reply with an empty string for \"answer\". Respond with a single JSON object "
    "of the form: {\"answer\": string, \"confidence\": number between 0 and 1, "
    "\"reason\": string | null}. The answer must be a draft for a human to review, not a "
    "commitment."
)


@dataclass(frozen=True)
class AiUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0


@dataclass(frozen=True)
class AiAnswer:
    answer: str
    confidence: float
    requires_user_confirmation: bool = True
    reason: str | None = None


@dataclass(frozen=True)
class AiGenerationResult:
    answer: AiAnswer | None
    usage: AiUsage
    error: str | None = None


def _trim(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return f"{value[:limit].rstrip()}…"


def _clean_skills(profile: Mapping[str, Any]) -> list[str]:
    skills: list[str] = []
    for item in profile.get("skills") or []:
        name = (item or {}).get("name")
        if isinstance(name, str) and name.strip():
            skills.append(name.strip())
    return skills[:8]


def build_minimal_context(
    *,
    profile: Mapping[str, Any] | None,
    job_context: Mapping[str, Any] | None,
    conversation: list[Mapping[str, Any]] | None,
) -> str:
    """Compose the smallest safe reference context for an AI call."""
    sections: list[str] = []

    facts: list[str] = []
    if profile:
        name = profile.get("full_name")
        if isinstance(name, str) and name.strip():
            facts.append(f"Full name: {_trim(name.strip(), 60)}")
        role = profile.get("current_role")
        if isinstance(role, str) and role.strip():
            facts.append(f"Current role: {_trim(role.strip(), 60)}")
        experience = profile.get("total_experience")
        if isinstance(experience, int):
            facts.append(f"Total experience: {experience} years")
        location = profile.get("location")
        if isinstance(location, str) and location.strip():
            facts.append(f"Location: {_trim(location.strip(), 60)}")
        skills = _clean_skills(profile)
        if skills:
            facts.append("Skills: " + ", ".join(_trim(skill, 40) for skill in skills))
        education_entries = []
        for entry in profile.get("education") or []:
            degree = (entry or {}).get("degree")
            institution = (entry or {}).get("institution")
            if degree or institution:
                education_entries.append(", ".join(str(part).strip() for part in (degree, institution) if part))
        for entry in education_entries[:2]:
            facts.append(f"Education: {_trim(entry, 120)}")
        certifications = profile.get("certifications") or []
        if certifications and isinstance(certifications, list):
            certs = [str(item).strip() for item in certifications if str(item).strip()][:3]
            if certs:
                facts.append("Certifications: " + ", ".join(_trim(cert, 40) for cert in certs))
        preferences = profile.get("preferences") or {}
        notice = (preferences or {}).get("notice_period")
        if isinstance(notice, str) and notice.strip():
            facts.append(f"Notice period: {_trim(notice.strip(), 40)}")
    if facts:
        sections.append("CONFIRMED PROFILE FACTS\n" + "\n".join(f"- {fact}" for fact in facts))

    if job_context:
        parts: list[str] = []
        for key in ("title", "company", "location"):
            value = job_context.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())
        if parts:
            sections.append("JOB CONTEXT\n- " + ", ".join(_trim(part, 60) for part in parts))
        job_skills = [str(skill).strip() for skill in (job_context.get("skills") or []) if str(skill).strip()]
        if job_skills:
            sections.append("REQUIRED SKILLS\n- " + ", ".join(_trim(skill, 40) for skill in job_skills[:8]))

    if conversation:
        turns: list[str] = []
        for turn in conversation[-3:]:
            role = (turn.get("role") or "USER").upper()
            text = _trim(str(turn.get("text") or "").strip(), 120)
            if text:
                turns.append(f"{role}: {text}")
        if turns:
            sections.append("RECENT CONVERSATION\n" + "\n".join(f"- {turn}" for turn in turns))

    return "\n\n".join(sections)


def _parse_and_validate(content: str) -> AiAnswer:
    data = json.loads(content)
    if not isinstance(data, dict):
        raise TypeError("Expected a JSON object from the AI provider")
    answer = data.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("AI response did not contain a usable answer")
    answer = answer.strip()
    if len(answer) > _MAX_ANSWER_LENGTH:
        answer = f"{answer[:_MAX_ANSWER_LENGTH].rstrip()}…"
    confidence = data.get("confidence", 0.5)
    try:
        confidence = min(1.0, max(0.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.5
    reason = data.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        reason = None
    return AiAnswer(answer=answer, confidence=confidence, requires_user_confirmation=True, reason=reason)


class AiService:
    def __init__(
        self,
        provider: AIProvider,
        *,
        max_output_tokens: int = _MAX_OUTPUT_TOKENS,
        timeout_seconds: float = _TIMEOUT_SECONDS,
    ) -> None:
        self._provider = provider
        self._max_output_tokens = max_output_tokens
        self._timeout_seconds = timeout_seconds

    @property
    def provider_name(self) -> str:
        return self._provider.name

    @property
    def model_name(self) -> str:
        return self._provider.model

    async def generate(self, question: str, *, context: str) -> AiGenerationResult:
        system = _SYSTEM_PROMPT
        prompt = f"Question from the recruiter:\n{question}\n\nReference context:\n{context}"

        response: ProviderResponse | None = None
        error: str | None = None
        try:
            response = await self._provider.complete(
                system=system,
                prompt=prompt,
                max_tokens=self._max_output_tokens,
                timeout_seconds=self._timeout_seconds,
            )
            answer = _parse_and_validate(response.content)
        except Exception as exc:  # noqa: BLE001 - provider or schema failures never crash the endpoint
            error = str(exc)[:500]

        usage = AiUsage(
            prompt_tokens=response.usage.prompt_tokens if response else 0,
            completion_tokens=response.usage.completion_tokens if response else 0,
            total_tokens=response.usage.total_tokens if response else 0,
            latency_ms=response.latency_ms if response else 0,
        )
        if error is not None:
            return AiGenerationResult(answer=None, usage=usage, error=error)
        return AiGenerationResult(answer=answer, usage=usage)


def build_provider(provider_name: str, *, api_key: str, model: str) -> AIProvider:
    if provider_name == "groq":
        return GroqProvider(api_key=api_key, model=model)
    raise ValueError(f"Unsupported AI provider: {provider_name!r}")