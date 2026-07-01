import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AssignmentStatus, AssignmentType, Semester


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


class CourseSummary(BaseModel):
    id: uuid.UUID
    name: str
    code: str

    model_config = {"from_attributes": True}


class SectionSummary(BaseModel):
    id: uuid.UUID
    semester: Semester
    year: int

    model_config = {"from_attributes": True}


class SectionWithCourse(BaseModel):
    id: uuid.UUID
    semester: Semester
    year: int
    course: CourseSummary

    model_config = {"from_attributes": True}


class AssignmentDetail(BaseModel):
    id: uuid.UUID
    title: str
    type: AssignmentType
    status: AssignmentStatus
    rubric: str | None
    due_date: datetime | None
    created_at: datetime
    questions: list[QuestionRead]
    section: SectionWithCourse

    model_config = {"from_attributes": True}


class StudentAssignment(BaseModel):
    id: uuid.UUID
    title: str
    type: AssignmentType
    status: AssignmentStatus
    due_date: datetime | None
    section: SectionSummary

    model_config = {"from_attributes": True}


class CourseAssignments(BaseModel):
    course: CourseSummary
    assignments: list[StudentAssignment]


class AssignmentUpdate(BaseModel):
    title: str | None = None
    type: AssignmentType | None = None
    rubric: str | None = None
    due_date: datetime | None = None
    questions: list[QuestionCreate] | None = None
