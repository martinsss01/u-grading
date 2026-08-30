import enum

from sqlalchemy import Enum as SAEnum


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Native Postgres ENUM that stores the member's lowercase `.value`, not its `.name`."""
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])


class Semester(str, enum.Enum):
    FALL = "Otoño"
    SPRING = "Primavera"
    SUMMER = "Verano"


class Role(str, enum.Enum):
    ADMIN = "Administrador"
    TEACHER = "Profesor"
    TA = "Ayudante"
    STUDENT = "Estudiante"


class AssignmentStatus(str, enum.Enum):
    """Purely a function of now vs. an assignment's open_date/due_date — see
    `app.models.assignment.compute_status`. Never stored; always computed."""

    PENDING = "Pendiente"
    OPEN = "Abierto"
    CLOSED = "Cerrado"


class AssignmentType(str, enum.Enum):
    HOMEWORK = "Tarea"
    QUIZ = "Ejercicio"
    TEST = "Control"
    FINAL_EXAM = "Examen"
