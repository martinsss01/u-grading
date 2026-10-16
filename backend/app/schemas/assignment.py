import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AssignmentStatus, AssignmentType, Modality, Semester
from app.schemas.submission import SubmissionRead


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
    modality: Modality = Modality.REMOTE
    rubric: str | None = None
    open_date: datetime | None = None
    due_date: datetime | None = None
    statement_published: bool = False
    review_published: bool = False
    questions: list[QuestionCreate] = Field(default_factory=list)


class AssignmentRead(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    title: str
    type: AssignmentType
    modality: Modality
    status: AssignmentStatus
    rubric: str | None
    open_date: datetime | None
    due_date: datetime | None
    created_at: datetime
    filename: str | None
    # Private grading guideline (teachers/TAs only); the file itself is access-checked.
    guideline_filename: str | None = None
    statement_published: bool
    review_published: bool
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
    section_number: int

    model_config = {"from_attributes": True}


class SectionWithCourse(BaseModel):
    id: uuid.UUID
    semester: Semester
    year: int
    course: CourseSummary

    model_config = {"from_attributes": True}


class QuestionGrade(BaseModel):
    question_id: uuid.UUID
    grade: float | None

    model_config = {"from_attributes": True}


class AssignmentDetail(BaseModel):
    id: uuid.UUID
    title: str
    type: AssignmentType
    modality: Modality
    status: AssignmentStatus
    rubric: str | None
    open_date: datetime | None
    due_date: datetime | None
    created_at: datetime
    filename: str | None
    review_published: bool
    questions: list[QuestionRead]
    section: SectionWithCourse
    answer_grades: list[QuestionGrade] | None = None
    # Named to avoid colliding with the `Assignment.submissions` ORM relationship
    # (which isn't eager-loaded here) — pydantic's from_attributes validation
    # would otherwise try to lazy-load it and crash outside an async context.
    submission_history: list[SubmissionRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class StudentAssignment(BaseModel):
    id: uuid.UUID
    title: str
    type: AssignmentType
    modality: Modality
    status: AssignmentStatus
    open_date: datetime | None
    due_date: datetime | None
    section: SectionSummary
    grade: float | None = None

    model_config = {"from_attributes": True}


class CourseAssignments(BaseModel):
    course: CourseSummary
    assignments: list[StudentAssignment]


class AssignmentUpdate(BaseModel):
    title: str | None = None
    type: AssignmentType | None = None
    modality: Modality | None = None
    rubric: str | None = None
    open_date: datetime | None = None
    due_date: datetime | None = None
    statement_published: bool | None = None
    review_published: bool | None = None
    questions: list[QuestionCreate] | None = None
