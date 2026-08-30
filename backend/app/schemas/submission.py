import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AssignmentType
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


class SubmissionRead(BaseModel):
    id: uuid.UUID
    needs_checking: bool
    created_at: datetime
    files: list[SubmissionFileRead]
    answers: list[AnswerRead]

    model_config = {"from_attributes": True}


class AssignmentWithSubmissions(BaseModel):
    id: uuid.UUID
    title: str
    type: AssignmentType
    submissions: list[SubmissionRead]


class SectionSubmissions(BaseModel):
    section: SectionRead
    assignments: list[AssignmentWithSubmissions]
