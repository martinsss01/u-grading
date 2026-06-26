import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AssignmentStatus, AssignmentType, pg_enum

if TYPE_CHECKING:
    from app.models.section import Section
    from app.models.submission import Submission


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sections.id"))
    title: Mapped[str] = mapped_column(String)
    type: Mapped[AssignmentType] = mapped_column(pg_enum(AssignmentType, "assignment_type"))
    rubric: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AssignmentStatus] = mapped_column(
        pg_enum(AssignmentStatus, "assignment_status"), default=AssignmentStatus.PENDING
    )
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    section: Mapped["Section"] = relationship(back_populates="assignments")
    questions: Mapped[list["Question"]] = relationship(back_populates="assignment")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="assignment")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"))
    number: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String)
    max_points: Mapped[float] = mapped_column(Float)

    assignment: Mapped["Assignment"] = relationship(back_populates="questions")
