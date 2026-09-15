import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ApplicationStatus(StrEnum):
    SAVED = "SAVED"
    READY = "READY"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    APPLIED = "APPLIED"
    INTERVIEW = "INTERVIEW"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"
    FAILED = "FAILED"


ALLOWED_TRANSITIONS: dict[ApplicationStatus, frozenset[ApplicationStatus]] = {
    ApplicationStatus.SAVED: frozenset(
        {
            ApplicationStatus.READY,
            ApplicationStatus.IN_PROGRESS,
            ApplicationStatus.REVIEW_REQUIRED,
            ApplicationStatus.APPLIED,
            ApplicationStatus.FAILED,
            ApplicationStatus.WITHDRAWN,
        }
    ),
    ApplicationStatus.READY: frozenset(
        {
            ApplicationStatus.IN_PROGRESS,
            ApplicationStatus.REVIEW_REQUIRED,
            ApplicationStatus.APPLIED,
            ApplicationStatus.FAILED,
            ApplicationStatus.WITHDRAWN,
        }
    ),
    ApplicationStatus.IN_PROGRESS: frozenset(
        {
            ApplicationStatus.READY,
            ApplicationStatus.REVIEW_REQUIRED,
            ApplicationStatus.APPLIED,
            ApplicationStatus.FAILED,
            ApplicationStatus.WITHDRAWN,
        }
    ),
    ApplicationStatus.REVIEW_REQUIRED: frozenset(
        {
            ApplicationStatus.IN_PROGRESS,
            ApplicationStatus.APPLIED,
            ApplicationStatus.FAILED,
            ApplicationStatus.WITHDRAWN,
        }
    ),
    ApplicationStatus.APPLIED: frozenset(
        {
            ApplicationStatus.INTERVIEW,
            ApplicationStatus.REJECTED,
            ApplicationStatus.WITHDRAWN,
            ApplicationStatus.FAILED,
        }
    ),
    ApplicationStatus.INTERVIEW: frozenset(
        {ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN}
    ),
    ApplicationStatus.REJECTED: frozenset(
        {ApplicationStatus.IN_PROGRESS, ApplicationStatus.APPLIED}
    ),
    ApplicationStatus.WITHDRAWN: frozenset(
        {ApplicationStatus.IN_PROGRESS, ApplicationStatus.APPLIED}
    ),
    ApplicationStatus.FAILED: frozenset(
        {ApplicationStatus.IN_PROGRESS, ApplicationStatus.APPLIED}
    ),
}


class ApplicationEventType(StrEnum):
    # PRD §36: application lifecycle events emitted by the engines.
    APPLICATION_STARTED = "APPLICATION_STARTED"
    APPLICATION_TYPE_DETECTED = "APPLICATION_TYPE_DETECTED"
    QUESTION_RECEIVED = "QUESTION_RECEIVED"
    QUESTION_CLASSIFIED = "QUESTION_CLASSIFIED"
    ANSWER_RETRIEVED = "ANSWER_RETRIEVED"
    AI_REQUESTED = "AI_REQUESTED"
    ANSWER_GENERATED = "ANSWER_GENERATED"
    ANSWER_MODIFIED = "ANSWER_MODIFIED"
    ANSWER_SUBMITTED = "ANSWER_SUBMITTED"
    USER_PAUSED = "USER_PAUSED"
    USER_RESUMED = "USER_RESUMED"
    CAPTCHA_DETECTED = "CAPTCHA_DETECTED"
    LOGIN_REQUIRED = "LOGIN_REQUIRED"
    APPLICATION_COMPLETED = "APPLICATION_COMPLETED"
    APPLICATION_FAILED = "APPLICATION_FAILED"
    TIMEOUT = "TIMEOUT"
    RESUME_PARSE_FAILED = "RESUME_PARSE_FAILED"
    EMERGENCY_STOP = "EMERGENCY_STOP"
    # Tracker milestone: lifecycle + user-intervention events needed by the tracker.
    APPLICATION_CREATED = "APPLICATION_CREATED"
    APPLICATION_STATUS_CHANGED = "APPLICATION_STATUS_CHANGED"
    APPLICATION_CANCELLED = "APPLICATION_CANCELLED"
    MANUAL_TAKEOVER = "MANUAL_TAKEOVER"
    USER_CORRECTION = "USER_CORRECTION"


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("user_id", "job_url", name="uq_applications_user_job_url"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("jobs.id", ondelete="SET NULL"),
        index=True,
    )
    resume_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resumes.id", ondelete="SET NULL"),
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), default="SAVED", nullable=False)
    source: Mapped[str | None] = mapped_column(String(100))
    job_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    company: Mapped[str | None] = mapped_column(String(255))
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    match_score: Mapped[float | None] = mapped_column(Float)
    application_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ApplicationEvent(Base):
    __tablename__ = "application_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    state: Mapped[str | None] = mapped_column(String(30))
    message: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ApplicationAnswer(Base):
    __tablename__ = "application_answers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    intent: Mapped[str | None] = mapped_column(String(50))
    interaction_type: Mapped[str | None] = mapped_column(String(30))
    answer: Mapped[str | None] = mapped_column(Text)
    answer_source: Mapped[str | None] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    was_ai_generated: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    user_modified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )