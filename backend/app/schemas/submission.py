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
    student_comment: str | None = None

    model_config = {"from_attributes": True}


class ColabSubmissionCreate(BaseModel):
    assignment_id: uuid.UUID
    user_id: uuid.UUID
    url: str
    submission_id: uuid.UUID | None = None
    comment: str | None = None


class AnnotationCreate(BaseModel):
    author_id: uuid.UUID
    page: int = Field(ge=1)
    position: dict[str, Any]
    highlighted_text: str | None = None
    comment: str = Field(min_length=1)


class AnnotationUpdate(BaseModel):
    author_id: uuid.UUID
    comment: str = Field(min_length=1)


class AnnotationAccept(BaseModel):
    author_id: uuid.UUID
    # Optionally reword the AI suggestion while accepting it.
    comment: str | None = Field(default=None, min_length=1)


class AnnotationRead(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    author_id: uuid.UUID | None
    author_name: str
    source: Literal["ta", "ai"]
    status: Literal["published", "suggested", "dismissed"]
    page: int
    position: dict[str, Any]
    highlighted_text: str | None
    comment: str
    created_at: datetime
    updated_at: datetime


class ReviewSubmissionRead(SubmissionRead):
    """What TAs see: anonymized (masked filenames and comment) plus the AI pipeline results."""

    pipeline_status: Literal["not_started", "queued", "processing", "done", "failed"]
    pipeline_error: str | None
    difficulty: int | None
    difficulty_reason: str | None
    ai_summary: str | None
    assigned_ta_id: uuid.UUID | None
    assigned_ta_name: str | None
    needs_anonymization_check: bool


class RedactionCreate(BaseModel):
    author_id: uuid.UUID
    page: int = Field(ge=1)
    rects: list[dict[str, float]] = Field(min_length=1)


class RedactionRead(BaseModel):
    id: uuid.UUID
    page: int
    rects: list[dict[str, float]]
    source: Literal["auto", "manual"]

    model_config = {"from_attributes": True}


class AssigneeUpdate(BaseModel):
    user_id: uuid.UUID
    ta_id: uuid.UUID | None


class AssignmentWithSubmissions(BaseModel):
    id: uuid.UUID
    title: str
    type: AssignmentType
    status: AssignmentStatus
    rubric: str | None
    open_date: datetime | None
    due_date: datetime | None
    filename: str | None
    guideline_filename: str | None = None
    pipeline_started_at: datetime | None = None
    submissions: list[ReviewSubmissionRead]


class SectionSubmissions(BaseModel):
    section: SectionRead
    assignments: list[AssignmentWithSubmissions]


class PipelineRun(BaseModel):
    user_id: uuid.UUID
    # Also re-process submissions that already finished (replaces pending AI suggestions).
    force: bool = False


class TaLoad(BaseModel):
    id: uuid.UUID
    name: str
    count: int
    total_difficulty: int


class PipelineOverview(BaseModel):
    assignment_id: uuid.UUID
    title: str
    status: AssignmentStatus
    pipeline_started_at: datetime | None
    has_guideline: bool
    tas: list[TaLoad]
    submissions: list[ReviewSubmissionRead]
