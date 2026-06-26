import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.assignment import Assignment, Question
    from app.models.user import User


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))  # anonymized to graders at the API layer
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"))
    file_path: Mapped[str] = mapped_column(String)
    needs_checking: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped["User"] = relationship()
    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    answers: Mapped[list["Answer"]] = relationship(back_populates="submission")


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"))
    file_path: Mapped[str | None] = mapped_column(String)
    grade: Mapped[float | None] = mapped_column(Float)
    graded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    submission: Mapped["Submission"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship()
    graded_by_user: Mapped["User | None"] = relationship(foreign_keys=[graded_by])
