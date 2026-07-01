import enum

from sqlalchemy import Enum as SAEnum


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Native Postgres ENUM that stores the member's lowercase `.value`, not its `.name`."""
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])


class Semester(str, enum.Enum):
    FALL = "Otoño"
    SPRING = "Primavera"


class Role(str, enum.Enum):
    ADMIN = "Administrador"
    TEACHER = "Profesor"
    TA = "Ayudante"
    STUDENT = "Estudiante"


class AssignmentStatus(str, enum.Enum):
    PENDING = "Pendiente"
    GRADING = "En Calificación"
    DONE = "Listo"


class AssignmentType(str, enum.Enum):
    HOMEWORK = "Tarea"
    QUIZ = "Ejercicio"
    TEST = "Control"
    FINAL_EXAM = "Examen"
