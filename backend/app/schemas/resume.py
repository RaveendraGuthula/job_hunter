from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ResumeBase(BaseModel):
    id: UUID
    user_id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    parse_status: str
    parse_error: str | None
    retry_count: int
    extracted_text: str | None
    parsed_data: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResumeRead(ResumeBase):
    pass


class ResumeListItem(BaseModel):
    id: UUID
    user_id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    parse_status: str
    parse_error: str | None
    retry_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)