from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.profile import Education, Experience, Preference, Profile, Skill
from app.models.user import User
from app.schemas.profile import (
    EducationIn,
    ExperienceIn,
    PreferencesIn,
    ProfileCreate,
    ProfileRead,
    ProfileUpdate,
    SkillIn,
)

router = APIRouter()

_PROFILE_LOAD = (
    selectinload(Profile.skills),
    selectinload(Profile.experience),
    selectinload(Profile.education),
    selectinload(Profile.preferences),
)


async def _get_own_profile(db: AsyncSession, user_id: object) -> Profile | None:
    return await db.scalar(
        select(Profile).where(Profile.user_id == user_id).options(*_PROFILE_LOAD)
    )


def _build_skills(items: list[SkillIn]) -> list[Skill]:
    return [
        Skill(name=item.name, experience=item.experience, sort_order=index)
        for index, item in enumerate(items)
    ]


def _build_experience(items: list[ExperienceIn]) -> list[Experience]:
    return [
        Experience(
            employer=item.employer,
            job_title=item.job_title,
            projects=item.projects,
            sort_order=index,
        )
        for index, item in enumerate(items)
    ]


def _build_education(items: list[EducationIn]) -> list[Education]:
    return [
        Education(
            degree=item.degree,
            institution=item.institution,
            graduation_year=item.graduation_year,
            sort_order=index,
        )
        for index, item in enumerate(items)
    ]


def _build_preferences(prefs: PreferencesIn) -> Preference:
    return Preference(
        preferred_locations=prefs.preferred_locations,
        remote_preference=prefs.remote_preference,
        relocation_preference=prefs.relocation_preference,
        notice_period=prefs.notice_period,
        expected_salary=prefs.expected_salary,
        current_salary=prefs.current_salary,
    )


@router.post("", response_model=ProfileRead, status_code=status.HTTP_201_CREATED)
async def create_profile(
    payload: ProfileCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Profile:
    existing = await db.scalar(select(Profile).where(Profile.user_id == current_user.id))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Profile already exists"
        )

    profile = Profile(
        user_id=current_user.id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        location=payload.location,
        current_role=payload.current_role,
        total_experience=payload.total_experience,
        languages=payload.languages or [],
        certifications=payload.certifications or [],
        work_authorization=payload.work_authorization,
        skills=_build_skills(payload.skills),
        experience=_build_experience(payload.experience),
        education=_build_education(payload.education),
    )
    if payload.preferences is not None:
        profile.preferences = _build_preferences(payload.preferences)

    db.add(profile)
    await db.commit()

    created = await _get_own_profile(db, current_user.id)
    if created is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reload created profile",
        )
    return created


@router.get("", response_model=ProfileRead)
async def get_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Profile:
    profile = await _get_own_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
        )
    return profile


@router.patch("", response_model=ProfileRead)
async def update_profile(
    payload: ProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Profile:
    profile = await _get_own_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found - create it first",
        )

    data = payload.model_dump(exclude_unset=True)

    if "full_name" in data and data["full_name"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="full_name cannot be null",
        )
    if "email" in data and data["email"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="email cannot be null",
        )

    for field in (
        "full_name",
        "email",
        "phone",
        "location",
        "current_role",
        "total_experience",
        "work_authorization",
    ):
        if field in data:
            setattr(profile, field, data[field])

    if "languages" in data:
        profile.languages = data["languages"] or []
    if "certifications" in data:
        profile.certifications = data["certifications"] or []

    if "skills" in data and payload.skills is not None:
        profile.skills = _build_skills(payload.skills)
    if "experience" in data and payload.experience is not None:
        profile.experience = _build_experience(payload.experience)
    if "education" in data and payload.education is not None:
        profile.education = _build_education(payload.education)

    if payload.preferences is not None:
        preferences_update = payload.preferences.model_dump(exclude_unset=True)
        if profile.preferences is None:
            profile.preferences = Preference(**preferences_update)
        else:
            for key, value in preferences_update.items():
                setattr(profile.preferences, key, value)
    elif "preferences" in data:
        if profile.preferences is not None:
            await db.delete(profile.preferences)
            profile.preferences = None

    await db.commit()

    updated = await _get_own_profile(db, current_user.id)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reload updated profile",
        )
    return updated