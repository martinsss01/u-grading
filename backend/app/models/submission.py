import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
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
    # Eager so every SubmissionRead can report the PDF status without an async lazy load.
    document: Mapped["SubmissionDocument | None"] = relationship(back_populates="submission", lazy="selectin")
    annotations: Mapped[list["SubmissionAnnotation"]] = relationship(back_populates="submission")


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


class SubmissionDocument(Base):
    """All of a submission's files merged into a single PDF for in-app review."""

    __tablename__ = "submission_documents"
    __table_args__ = (CheckConstraint("status IN ('pending', 'ready', 'failed')", name="ck_submission_documents_status"),)

    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), primary_key=True)
    pdf_path: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")
    error: Mapped[str | None] = mapped_column(Text)
    page_count: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    submission: Mapped["Submission"] = relationship(back_populates="document")


class SubmissionAnnotation(Base):
    """A TA comment anchored to a spot (area or text highlight) of the merged PDF."""

    __tablename__ = "submission_annotations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    page: Mapped[int] = mapped_column(Integer)
    # The viewer's page-scaled position, stored as-is so it survives zoom changes.
    position: Mapped[dict] = mapped_column(JSONB)
    highlighted_text: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    submission: Mapped["Submission"] = relationship(back_populates="annotations")
    author: Mapped["User"] = relationship()
