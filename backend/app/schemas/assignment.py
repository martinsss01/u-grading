import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AssignmentStatus, AssignmentType


class QuestionCreate(BaseModel):
    number: int
    description: str
    max_points: float


class QuestionRead(QuestionCreate):
    id: uuid.UUID

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    section_id: uuid.UUID
    title: str
    type: AssignmentType
    rubric: str | None = None
    due_date: datetime | None = None
    questions: list[QuestionCreate] = Field(default_factory=list)


class AssignmentRead(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    title: str
    type: AssignmentType
    status: AssignmentStatus
    rubric: str | None
    due_date: datetime | None
    created_at: datetime
    questions: list[QuestionRead]

    model_config = {"from_attributes": True}
