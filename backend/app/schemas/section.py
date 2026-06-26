import uuid

from pydantic import BaseModel

from app.models.enums import Semester


class CourseRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str

    model_config = {"from_attributes": True}


class SectionRead(BaseModel):
    id: uuid.UUID
    semester: Semester
    year: int
    course: CourseRead

    model_config = {"from_attributes": True}
