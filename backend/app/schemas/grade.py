from pydantic import BaseModel


class GradeBase(BaseModel):
    student_name: str
    subject: str
    score: float


class GradeCreate(GradeBase):
    pass


class GradeRead(GradeBase):
    id: int

    model_config = {"from_attributes": True}
