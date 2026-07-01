import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import AssignmentType
from app.schemas.section import SectionRead


class AnswerRead(BaseModel):
    id: uuid.UUID
    question_id: uuid.UUID
    grade: float | None
    graded_at: datetime | None

    model_config = {"from_attributes": True}


class SubmissionRead(BaseModel):
    id: uuid.UUID
    file_path: str
    needs_checking: bool
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
