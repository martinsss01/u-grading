import uuid

from pydantic import BaseModel

from app.models.enums import Role, Semester


class CourseRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str

    model_config = {"from_attributes": True}


class SectionRead(BaseModel):
    id: uuid.UUID
    semester: Semester
    year: int
    section_number: int
    course: CourseRead

    model_config = {"from_attributes": True}


class SectionCreate(BaseModel):
    course_id: uuid.UUID
    semester: Semester
    year: int


class SectionUpdate(BaseModel):
    course_id: uuid.UUID | None = None
    semester: Semester | None = None
    year: int | None = None


class UserSummary(BaseModel):
    id: uuid.UUID
    name: str
    email: str

    model_config = {"from_attributes": True}


class SectionMemberRead(BaseModel):
    id: uuid.UUID
    role: Role
    user: UserSummary

    model_config = {"from_attributes": True}


class SectionDetail(BaseModel):
    id: uuid.UUID
    semester: Semester
    year: int
    section_number: int
    course: CourseRead
    members: list[SectionMemberRead]

    model_config = {"from_attributes": True}


class SectionMemberCreate(BaseModel):
    user_id: uuid.UUID
    role: Role
