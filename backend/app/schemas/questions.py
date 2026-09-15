from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.profile import EducationIn, ExperienceIn, PreferencesIn, SkillIn
from app.services.form_intents import AnswerSource

QuestionStr = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
]


class RelevantProfile(BaseModel):
    """Minimal, confirmed profile facts accepted for answer resolution.

    This deliberately mirrors `ProfileCreate` but keeps every field optional so the
    engine only ever sees what the client chooses to send as relevant context.
    """

    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    current_role: str | None = None
    total_experience: int | None = Field(default=None, ge=0, le=100)
    languages: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    work_authorization: str | None = None
    skills: list[SkillIn] = Field(default_factory=list)
    experience: list[ExperienceIn] = Field(default_factory=list)
    education: list[EducationIn] = Field(default_factory=list)
    preferences: PreferencesIn | None = None


class RelevantJobContext(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    company: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    skills: list[str] = Field(default_factory=list)
    description: str | None = Field(default=None, max_length=4000)


class ConversationTurn(BaseModel):
    role: Literal["BOT", "USER"]
    text: Annotated[str, StringConstraints(min_length=1, max_length=2000)]


class QuestionClassifyRequest(BaseModel):
    question: QuestionStr


class QuestionClassifyResult(BaseModel):
    question: str
    normalized_question: str
    intent: str
    confidence: float
    skill_hint: str | None = None


class QuestionAnswerRequest(BaseModel):
    question: QuestionStr
    relevant_profile: RelevantProfile | None = None
    relevant_job_context: RelevantJobContext | None = None
    relevant_conversation_context: list[ConversationTurn] | None = None


class QuestionAnswerResult(BaseModel):
    answer: str | None
    confidence: float
    requires_user_confirmation: bool
    reason: str | None
    answer_source: AnswerSource | None
    intent: str
    was_ai_generated: bool