from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.application import Application, ApplicationEvent
from app.models.user import User
from app.schemas.application import (
    ApplicationCreate,
    ApplicationEventCreate,
    ApplicationEventRead,
    ApplicationRead,
    ApplicationUpdate,
)
from app.services.application_service import (
    ApplicationNotFoundError,
    ApplicationTransitionError,
    add_event,
    create_application,
    get_application,
    list_applications,
    list_events,
    update_application,
)

router = APIRouter()


def _to_uuid_or_404(application_id: str) -> UUID:
    try:
        return UUID(application_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )


async def _get_own_application(
    db: AsyncSession, user_id: object, application_id: str
) -> Application:
    application = await get_application(db, user_id, _to_uuid_or_404(application_id))
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )
    return application


@router.post("", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
async def create_application_endpoint(
    payload: ApplicationCreate,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Application:
    try:
        application, created = await create_application(db, current_user.id, payload)
    except ApplicationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    await db.commit()
    await db.refresh(application)
    if not created:
        response.status_code = status.HTTP_200_OK
    return application


@router.get("", response_model=list[ApplicationRead])
async def list_applications_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Application]:
    return await list_applications(db, current_user.id)


@router.get("/{application_id}", response_model=ApplicationRead)
async def get_application_endpoint(
    application_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Application:
    return await _get_own_application(db, current_user.id, application_id)


@router.patch("/{application_id}", response_model=ApplicationRead)
async def update_application_endpoint(
    application_id: str,
    payload: ApplicationUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Application:
    application = await _get_own_application(db, current_user.id, application_id)
    try:
        application = await update_application(db, application, payload)
    except ApplicationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ApplicationTransitionError as exc:
        allowed_str = ", ".join(sorted(exc.allowed))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Status transition from {exc.current} to {exc.requested} is not "
                f"allowed. Allowed transitions: {allowed_str}."
            ),
        )
    await db.commit()
    await db.refresh(application)
    return application


@router.post(
    "/{application_id}/events",
    response_model=ApplicationEventRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_application_event_endpoint(
    application_id: str,
    payload: ApplicationEventCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApplicationEvent:
    application = await _get_own_application(db, current_user.id, application_id)
    event = await add_event(
        db,
        application,
        payload.event_type,
        message=payload.message,
        metadata=payload.metadata,
    )
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/{application_id}/events", response_model=list[ApplicationEventRead])
async def list_application_events_endpoint(
    application_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ApplicationEvent]:
    await _get_own_application(db, current_user.id, application_id)
    return await list_events(db, _to_uuid_or_404(application_id))