import enum

from sqlalchemy import Enum as SAEnum


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Native Postgres ENUM that stores the member's lowercase `.value`, not its `.name`."""
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])


class Semester(str, enum.Enum):
    FALL = "fall"
    SPRING = "spring"


class Role(str, enum.Enum):
    TEACHER = "teacher"
    TA = "ta"
    STUDENT = "student"


class AssignmentStatus(str, enum.Enum):
    PENDING = "pending"
    GRADING = "grading"
    DONE = "done"


class AssignmentType(str, enum.Enum):
    HOMEWORK = "homework"
    QUIZ = "quiz"
    TEST = "test"
    FINAL_EXAM = "final_exam"
