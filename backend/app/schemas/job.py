from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.profile import NonEmptyStr100, NonEmptyStr255, OptionalStr255

NonEmptyStrLong = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2048)
]
OptionalStrLong = Annotated[
    str | None, StringConstraints(strip_whitespace=True, max_length=2048)
]
SourceStr = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
OptionalExpression = Annotated[
    str | None, StringConstraints(strip_whitespace=True, max_length=100)
]


class JobExtractionInput(BaseModel):
    title: NonEmptyStr255
    company: OptionalStr255 = None
    location: OptionalStr255 = None
    description: str | None = Field(default=None, max_length=200_000)
    required_experience: OptionalExpression = None
    skills: list[NonEmptyStr100] = Field(default_factory=list)
    salary: OptionalStr255 = None
    job_url: NonEmptyStrLong
    source: SourceStr
    external_application_url: OptionalStrLong = None


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    company: str | None
    location: str | None
    description: str | None
    required_experience: str | None
    skills: list[str] | None
    salary: str | None
    job_url: str
    source: str
    external_application_url: str | None
    created_at: datetime
    updated_at: datetime


class MatchReason(BaseModel):
    dimension: str
    outcome: str
    message: str


class JobMatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    job_id: UUID
    overall_score: int
    skills_score: int
    experience_score: int
    education_score: int
    location_score: int
    reasons: list[MatchReason]
    created_at: datetime
    updated_at: datetime


class JobMatchRequest(BaseModel):
    job_id: UUID


class MatchScoreOut(BaseModel):
    overall: int
    skills: int
    experience: int
    education: int
    location: int
    reasons: list[MatchReason]