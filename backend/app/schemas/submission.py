import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.enums import AssignmentStatus, AssignmentType
from app.schemas.section import SectionRead


class AnswerRead(BaseModel):
    id: uuid.UUID
    question_id: uuid.UUID
    grade: float | None = Field(default=None, ge=1.0, le=7.0)
    graded_at: datetime | None

    model_config = {"from_attributes": True}


class SubmissionFileRead(BaseModel):
    id: uuid.UUID
    filename: str

    model_config = {"from_attributes": True}


class SubmissionDocumentRead(BaseModel):
    status: Literal["pending", "ready", "failed"]
    page_count: int | None
    error: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubmissionRead(BaseModel):
    id: uuid.UUID
    needs_checking: bool
    created_at: datetime
    files: list[SubmissionFileRead]
    answers: list[AnswerRead]
    document: SubmissionDocumentRead | None = None

    model_config = {"from_attributes": True}


class ColabSubmissionCreate(BaseModel):
    assignment_id: uuid.UUID
    user_id: uuid.UUID
    url: str
    submission_id: uuid.UUID | None = None


class AnnotationCreate(BaseModel):
    author_id: uuid.UUID
    page: int = Field(ge=1)
    position: dict[str, Any]
    highlighted_text: str | None = None
    comment: str = Field(min_length=1)


class AnnotationUpdate(BaseModel):
    author_id: uuid.UUID
    comment: str = Field(min_length=1)


class AnnotationRead(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str
    page: int
    position: dict[str, Any]
    highlighted_text: str | None
    comment: str
    created_at: datetime
    updated_at: datetime


class AssignmentWithSubmissions(BaseModel):
    id: uuid.UUID
    title: str
    type: AssignmentType
    status: AssignmentStatus
    rubric: str | None
    open_date: datetime | None
    due_date: datetime | None
    filename: str | None
    submissions: list[SubmissionRead]


class SectionSubmissions(BaseModel):
    section: SectionRead
    assignments: list[AssignmentWithSubmissions]
