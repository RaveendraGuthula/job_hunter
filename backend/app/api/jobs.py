from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.job import Job, JobMatch
from app.models.profile import Profile
from app.models.user import User
from app.schemas.job import (
    JobExtractionInput,
    JobMatchRead,
    JobMatchRequest,
    JobRead,
)
from app.services.job_extractor import normalize_job_input
from app.services.job_matcher import match_job

router = APIRouter()

_PROFILE_LOAD = (
    selectinload(Profile.skills),
    selectinload(Profile.experience),
    selectinload(Profile.education),
    selectinload(Profile.preferences),
)


def _to_uuid_or_404(job_id: str) -> UUID:
    try:
        return UUID(job_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )


async def _get_own_job(db: AsyncSession, user_id: object, job_id: UUID) -> Job | None:
    return await db.scalar(select(Job).where(Job.id == job_id, Job.user_id == user_id))


async def _get_own_profile(db: AsyncSession, user_id: object) -> Profile | None:
    return await db.scalar(
        select(Profile).where(Profile.user_id == user_id).options(*_PROFILE_LOAD)
    )


async def _get_own_job_match(
    db: AsyncSession, user_id: object, job_id: UUID
) -> JobMatch | None:
    return await db.scalar(
        select(JobMatch).where(JobMatch.job_id == job_id, JobMatch.user_id == user_id)
    )


@router.post("/analyze", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def analyze_job(
    payload: JobExtractionInput,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Job:
    normalized = normalize_job_input(**payload.model_dump())

    existing = await db.scalar(
        select(Job).where(
            Job.user_id == current_user.id,
            Job.source == normalized["source"],
            Job.job_url == normalized["job_url"],
        )
    )
    if existing is not None:
        existing.title = normalized["title"]
        existing.company = normalized["company"]
        existing.location = normalized["location"]
        existing.description = normalized["description"]
        existing.required_experience = normalized["required_experience"]
        existing.skills = normalized["skills"]
        existing.salary = normalized["salary"]
        existing.external_application_url = normalized["external_application_url"]
        await db.commit()
        await db.refresh(existing)
        response.status_code = status.HTTP_200_OK
        return existing

    job = Job(
        user_id=current_user.id,
        title=normalized["title"],
        company=normalized["company"],
        location=normalized["location"],
        description=normalized["description"],
        required_experience=normalized["required_experience"],
        skills=normalized["skills"],
        salary=normalized["salary"],
        job_url=normalized["job_url"],
        source=normalized["source"],
        external_application_url=normalized["external_application_url"],
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/match", response_model=JobMatchRead, status_code=status.HTTP_201_CREATED)
async def create_match(
    payload: JobMatchRequest,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobMatch:
    job = await _get_own_job(db, current_user.id, payload.job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    profile = await _get_own_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Confirm your profile before matching jobs",
        )

    result = match_job(profile, job)
    existing = await _get_own_job_match(db, current_user.id, job.id)
    if existing is not None:
        existing.overall_score = result["overall_score"]
        existing.skills_score = result["skills_score"]
        existing.experience_score = result["experience_score"]
        existing.education_score = result["education_score"]
        existing.location_score = result["location_score"]
        existing.reasons = result["reasons"]
        await db.commit()
        await db.refresh(existing)
        response.status_code = status.HTTP_200_OK
        return existing

    job_match = JobMatch(
        user_id=current_user.id,
        job_id=job.id,
        overall_score=result["overall_score"],
        skills_score=result["skills_score"],
        experience_score=result["experience_score"],
        education_score=result["education_score"],
        location_score=result["location_score"],
        reasons=result["reasons"],
    )
    db.add(job_match)
    await db.commit()
    await db.refresh(job_match)
    return job_match


@router.get("", response_model=list[JobRead])
async def list_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Job]:
    rows = (
        await db.execute(
            select(Job)
            .where(Job.user_id == current_user.id)
            .order_by(Job.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.get("/{job_id}", response_model=JobRead)
async def get_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Job:
    job = await _get_own_job(db, current_user.id, _to_uuid_or_404(job_id))
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    return job


@router.get("/{job_id}/match", response_model=JobMatchRead)
async def get_job_match(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobMatch:
    job = await _get_own_job(db, current_user.id, _to_uuid_or_404(job_id))
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    job_match = await _get_own_job_match(db, current_user.id, job.id)
    if job_match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Match not found"
        )
    return job_match