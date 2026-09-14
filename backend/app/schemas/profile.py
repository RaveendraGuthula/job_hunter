from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

NonEmptyStr100 = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
NonEmptyStr255 = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]
OptionalStr100 = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=100)]
OptionalStr255 = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)]
OptionalStr50 = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=50)]


class SkillIn(BaseModel):
    name: NonEmptyStr100
    experience: int | None = Field(default=None, ge=0, le=100)


class SkillOut(SkillIn):
    id: UUID


class ExperienceIn(BaseModel):
    employer: NonEmptyStr255
    job_title: NonEmptyStr255
    projects: list[str] = Field(default_factory=list)


class ExperienceOut(ExperienceIn):
    id: UUID


class EducationIn(BaseModel):
    degree: NonEmptyStr255
    institution: NonEmptyStr255
    graduation_year: int | None = Field(default=None, ge=1900, le=2200)


class EducationOut(EducationIn):
    id: UUID


class PreferencesIn(BaseModel):
    preferred_locations: list[str] = Field(default_factory=list)
    remote_preference: bool | None = None
    relocation_preference: bool | None = None
    notice_period: OptionalStr100 = None
    expected_salary: int | None = Field(default=None, ge=0)
    current_salary: int | None = Field(default=None, ge=0)


class PreferencesOut(PreferencesIn):
    pass


class ProfileCreate(BaseModel):
    full_name: NonEmptyStr255
    email: EmailStr
    phone: OptionalStr50 = None
    location: OptionalStr255 = None
    current_role: OptionalStr255 = None
    total_experience: int | None = Field(default=None, ge=0, le=100)
    languages: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    work_authorization: OptionalStr100 = None
    skills: list[SkillIn] = Field(default_factory=list)
    experience: list[ExperienceIn] = Field(default_factory=list)
    education: list[EducationIn] = Field(default_factory=list)
    preferences: PreferencesIn | None = None


class ProfileUpdate(BaseModel):
    full_name: NonEmptyStr255 | None = None
    email: EmailStr | None = None
    phone: OptionalStr50 = None
    location: OptionalStr255 = None
    current_role: OptionalStr255 = None
    total_experience: int | None = Field(default=None, ge=0, le=100)
    languages: list[str] | None = None
    certifications: list[str] | None = None
    work_authorization: OptionalStr100 = None
    skills: list[SkillIn] | None = None
    experience: list[ExperienceIn] | None = None
    education: list[EducationIn] | None = None
    preferences: PreferencesIn | None = None


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    full_name: str
    email: EmailStr
    phone: str | None
    location: str | None
    current_role: str | None
    total_experience: int | None
    languages: list[str]
    certifications: list[str]
    work_authorization: str | None
    skills: list[SkillOut]
    experience: list[ExperienceOut]
    education: list[EducationOut]
    preferences: PreferencesOut | None
    created_at: datetime
    updated_at: datetime