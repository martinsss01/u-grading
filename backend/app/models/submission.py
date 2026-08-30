import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.assignment import Assignment, Question
    from app.models.user import User


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))  # anonymized to graders at the API layer
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"))
    needs_checking: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()
    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    answers: Mapped[list["Answer"]] = relationship(back_populates="submission")
    files: Mapped[list["SubmissionFile"]] = relationship(back_populates="submission")


class SubmissionFile(Base):
    """One uploaded file within a submission — a submission can bundle several."""

    __tablename__ = "submission_files"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    file_path: Mapped[str] = mapped_column(String)
    filename: Mapped[str] = mapped_column(String)

    submission: Mapped["Submission"] = relationship(back_populates="files")


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (CheckConstraint("grade >= 1 AND grade <= 7", name="ck_answers_grade_range"),)

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"))
    file_path: Mapped[str | None] = mapped_column(String)
    grade: Mapped[float | None] = mapped_column(Float)
    graded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    submission: Mapped["Submission"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship()
    graded_by_user: Mapped["User | None"] = relationship(foreign_keys=[graded_by])
