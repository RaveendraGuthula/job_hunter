import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume import ResumeListItem, ResumeRead
from app.services.resume_parser import (
    MAX_REPARSE_ATTEMPTS,
    ResumeParseError,
    bounded_parse_resume,
    sha256_hex,
    validate_upload,
)
from app.services.resume_storage import (
    delete_file,
    generate_stored_filename,
    read_file,
    write_file,
)

router = APIRouter()


def _to_uuid_or_404(resume_id: str) -> UUID:
    try:
        return UUID(resume_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found"
        )


async def _get_own_resume(db: AsyncSession, user_id: object, resume_id: UUID) -> Resume | None:
    return await db.scalar(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user_id)
    )


@router.post("", response_model=ResumeRead, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Resume:
    data = await file.read()
    try:
        extension = validate_upload(data, file.content_type or "")
    except ResumeParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    stored_filename = generate_stored_filename(extension)
    await write_file(stored_filename, data)

    resume = Resume(
        user_id=current_user.id,
        original_filename=file.filename or f"resume.{extension}",
        content_type=file.content_type or "",
        stored_filename=stored_filename,
        size_bytes=len(data),
        sha256=sha256_hex(data),
        parse_status="pending",
        retry_count=0,
    )
    db.add(resume)
    await db.commit()

    try:
        text, fields = bounded_parse_resume(data, file.content_type or "")
    except ResumeParseError as exc:
        resume.parse_status = "failed"
        resume.parse_error = str(exc)
        resume.parsed_data = None
        resume.extracted_text = None
        await db.commit()
        await db.refresh(resume)
        return resume

    resume.parse_status = "parsed"
    resume.parse_error = None
    resume.extracted_text = text
    resume.parsed_data = fields
    await db.commit()
    await db.refresh(resume)
    return resume


@router.get("", response_model=list[ResumeListItem])
async def list_resumes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Resume]:
    rows = (
        await db.execute(
            select(Resume)
            .where(Resume.user_id == current_user.id)
            .order_by(Resume.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.get("/{resume_id}", response_model=ResumeRead)
async def get_resume(
    resume_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Resume:
    resume = await _get_own_resume(db, current_user.id, _to_uuid_or_404(resume_id))
    if resume is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found"
        )
    return resume


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    resume = await _get_own_resume(db, current_user.id, _to_uuid_or_404(resume_id))
    if resume is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found"
        )
    stored_filename = resume.stored_filename
    await db.delete(resume)
    await db.commit()
    try:
        delete_file(stored_filename)
    except OSError:
        pass


@router.post("/{resume_id}/reparse", response_model=ResumeRead)
async def reparse_resume(
    resume_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Resume:
    resume = await _get_own_resume(db, current_user.id, _to_uuid_or_404(resume_id))
    if resume is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found"
        )
    if resume.retry_count >= MAX_REPARSE_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Maximum retry attempts ({MAX_REPARSE_ATTEMPTS}) reached",
        )

    try:
        data = await asyncio.to_thread(read_file, resume.stored_filename)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume file missing from storage",
        )

    try:
        text, fields = bounded_parse_resume(data, resume.content_type)
    except ResumeParseError as exc:
        resume.parse_status = "failed"
        resume.parse_error = str(exc)
        resume.parsed_data = None
        resume.extracted_text = None
        resume.retry_count += 1
        await db.commit()
        await db.refresh(resume)
        return resume

    resume.parse_status = "parsed"
    resume.parse_error = None
    resume.extracted_text = text
    resume.parsed_data = fields
    resume.retry_count += 1
    await db.commit()
    await db.refresh(resume)
    return resume