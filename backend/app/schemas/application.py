from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.application import ApplicationEventType, ApplicationStatus
from app.schemas.profile import NonEmptyStr255, OptionalStr100, OptionalStr255

NonEmptyStrLong = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2048)
]


class ApplicationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_title: NonEmptyStr255
    company: OptionalStr255 = None
    source: OptionalStr100 = None
    job_url: NonEmptyStrLong
    job_id: UUID | None = None
    resume_id: UUID | None = None
    status: ApplicationStatus = ApplicationStatus.SAVED
    match_score: float | None = Field(default=None, ge=0, le=100)
    application_date: datetime | None = None


class ApplicationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ApplicationStatus | None = None
    job_title: NonEmptyStr255 | None = None
    company: OptionalStr255 = None
    source: OptionalStr100 = None
    resume_id: UUID | None = None
    match_score: float | None = Field(default=None, ge=0, le=100)
    application_date: datetime | None = None


class ApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    job_id: UUID | None
    resume_id: UUID | None
    status: ApplicationStatus
    source: str | None
    job_url: str
    company: str | None
    job_title: str
    match_score: float | None
    application_date: datetime
    created_at: datetime
    updated_at: datetime


class ApplicationEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: ApplicationEventType
    message: str | None = Field(default=None, max_length=2000)
    metadata: dict[str, object] | None = None


class ApplicationEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    application_id: UUID
    event_type: ApplicationEventType
    state: str | None
    message: str | None
    metadata: dict[str, object] | None = Field(default=None, validation_alias="metadata_")
    created_at: datetime