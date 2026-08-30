import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AssignmentStatus, AssignmentType, pg_enum

if TYPE_CHECKING:
    from app.models.section import Section
    from app.models.submission import Submission


def compute_status(open_date: datetime | None, due_date: datetime | None, now: datetime | None = None) -> AssignmentStatus:
    """An assignment's status is always derived from its dates, never stored:
    not open yet, open for submissions, or past its due date."""
    now = now or datetime.now(timezone.utc)
    if open_date is not None and now < open_date:
        return AssignmentStatus.PENDING
    if due_date is not None and now >= due_date:
        return AssignmentStatus.CLOSED
    return AssignmentStatus.OPEN


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sections.id"))
    title: Mapped[str] = mapped_column(String)
    type: Mapped[AssignmentType] = mapped_column(pg_enum(AssignmentType, "assignment_type"))
    rubric: Mapped[str | None] = mapped_column(Text)
    open_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # The evaluation document the professor attaches instead of typing questions
    # in by hand — file_path is where it lives on disk, filename is what
    # students see and download it as.
    file_path: Mapped[str | None] = mapped_column(String)
    filename: Mapped[str | None] = mapped_column(String)

    section: Mapped["Section"] = relationship(back_populates="assignments")
    questions: Mapped[list["Question"]] = relationship(back_populates="assignment")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="assignment")

    @property
    def status(self) -> AssignmentStatus:
        return compute_status(self.open_date, self.due_date)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"))
    number: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String)
    max_points: Mapped[float] = mapped_column(Float)

    assignment: Mapped["Assignment"] = relationship(back_populates="questions")
