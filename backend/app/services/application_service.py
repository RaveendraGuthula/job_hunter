from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import (
    ALLOWED_TRANSITIONS,
    Application,
    ApplicationEvent,
    ApplicationEventType,
    ApplicationStatus,
)
from app.models.job import Job
from app.models.resume import Resume
from app.schemas.application import ApplicationCreate, ApplicationUpdate


class ApplicationNotFoundError(LookupError):
    pass


class ApplicationTransitionError(ValueError):
    def __init__(self, current: str, requested: str, allowed: frozenset[str]) -> None:
        super().__init__(f"Cannot change application status from {current} to {requested}")
        self.current = current
        self.requested = requested
        self.allowed = allowed


def normalize_job_url(value: str) -> str:
    """Deterministic lowercase identity used for duplicate detection."""
    text = value.strip()
    if not text:
        return text
    try:
        parts = urlsplit(text)
    except ValueError:
        return text.rstrip("/")
    if not parts.scheme:
        return text.rstrip("/")
    scheme = parts.scheme.lower()
    netloc = (parts.netloc or "").lower()
    path = parts.path.rstrip("/")
    return urlunsplit((scheme, netloc, path, parts.query or "", ""))


async def _get_own_job(db: AsyncSession, user_id: object, job_id: UUID) -> Job | None:
    return await db.scalar(
        select(Job).where(Job.id == job_id, Job.user_id == user_id)
    )


async def _get_own_resume(db: AsyncSession, user_id: object, resume_id: UUID) -> Resume | None:
    return await db.scalar(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user_id)
    )


def record_event(
    db: AsyncSession,
    application: Application,
    event_type: ApplicationEventType,
    *,
    message: str | None = None,
    metadata: dict | None = None,
) -> ApplicationEvent:
    event = ApplicationEvent(
        application_id=application.id,
        event_type=event_type.value,
        state=application.status,
        message=message,
        metadata_=metadata,
    )
    db.add(event)
    return event


async def create_application(
    db: AsyncSession, user_id: object, payload: ApplicationCreate
) -> tuple[Application, bool]:
    job_url = normalize_job_url(payload.job_url)

    if payload.job_id is not None:
        job = await _get_own_job(db, user_id, payload.job_id)
        if job is None:
            raise ApplicationNotFoundError("Job not found")
    if payload.resume_id is not None:
        resume = await _get_own_resume(db, user_id, payload.resume_id)
        if resume is None:
            raise ApplicationNotFoundError("Resume not found")

    existing = await db.scalar(
        select(Application).where(
            Application.user_id == user_id, Application.job_url == job_url
        )
    )
    if existing is not None:
        return existing, False
    if payload.job_id is not None:
        existing_by_job = await db.scalar(
            select(Application).where(
                Application.user_id == user_id, Application.job_id == payload.job_id
            )
        )
        if existing_by_job is not None:
            return existing_by_job, False

    application = Application(
        user_id=user_id,
        job_id=payload.job_id,
        resume_id=payload.resume_id,
        status=payload.status.value,
        source=payload.source,
        job_url=job_url,
        company=payload.company,
        job_title=payload.job_title,
        match_score=payload.match_score,
    )
    if payload.application_date is not None:
        application.application_date = payload.application_date
    db.add(application)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(
            select(Application).where(
                Application.user_id == user_id, Application.job_url == job_url
            )
        )
        if existing is not None:
            return existing, False
        raise

    record_event(db, application, ApplicationEventType.APPLICATION_CREATED)
    return application, True


async def list_applications(db: AsyncSession, user_id: object) -> list[Application]:
    rows = (
        await db.execute(
            select(Application)
            .where(Application.user_id == user_id)
            .order_by(Application.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def get_application(
    db: AsyncSession, user_id: object, application_id: UUID
) -> Application | None:
    return await db.scalar(
        select(Application).where(
            Application.id == application_id, Application.user_id == user_id
        )
    )


async def update_application(
    db: AsyncSession, application: Application, payload: ApplicationUpdate
) -> Application:
    if (
        "status" in payload.model_fields_set
        and payload.status is not None
        and payload.status.value != application.status
    ):
        current = ApplicationStatus(application.status)
        requested = payload.status
        allowed = ALLOWED_TRANSITIONS[current]
        if requested not in allowed:
            raise ApplicationTransitionError(
                current.value, requested.value, frozenset(s.value for s in allowed)
            )
        application.status = requested.value
        record_event(
            db,
            application,
            ApplicationEventType.APPLICATION_STATUS_CHANGED,
            metadata={"from": current.value, "to": requested.value},
        )

    if "job_title" in payload.model_fields_set and payload.job_title is not None:
        application.job_title = payload.job_title
    if "company" in payload.model_fields_set:
        application.company = payload.company
    if "source" in payload.model_fields_set:
        application.source = payload.source
    if "match_score" in payload.model_fields_set:
        application.match_score = payload.match_score
    if "application_date" in payload.model_fields_set and payload.application_date is not None:
        application.application_date = payload.application_date
    if "resume_id" in payload.model_fields_set:
        if payload.resume_id is not None:
            resume = await _get_own_resume(db, application.user_id, payload.resume_id)
            if resume is None:
                raise ApplicationNotFoundError("Resume not found")
        application.resume_id = payload.resume_id
    return application


async def add_event(
    db: AsyncSession,
    application: Application,
    event_type: ApplicationEventType,
    *,
    message: str | None = None,
    metadata: dict | None = None,
) -> ApplicationEvent:
    return record_event(db, application, event_type, message=message, metadata=metadata)


async def list_events(db: AsyncSession, application_id: UUID) -> list[ApplicationEvent]:
    rows = (
        await db.execute(
            select(ApplicationEvent)
            .where(ApplicationEvent.application_id == application_id)
            .order_by(ApplicationEvent.created_at.asc())
        )
    ).scalars().all()
    return list(rows)