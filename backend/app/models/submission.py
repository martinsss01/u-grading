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


PIPELINE_STATUSES = ("not_started", "queued", "processing", "done", "failed")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        CheckConstraint(
            "pipeline_status IN ('not_started', 'queued', 'processing', 'done', 'failed')",
            name="ck_submissions_pipeline_status",
        ),
        CheckConstraint("difficulty >= 1 AND difficulty <= 100", name="ck_submissions_difficulty_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))  # anonymized to graders at the API layer
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"))
    needs_checking: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Optional note the student leaves when submitting.
    student_comment: Mapped[str | None] = mapped_column(Text)

    # AI pipeline (OCR -> anonymize -> review -> distribute), run once the assignment closes.
    pipeline_status: Mapped[str] = mapped_column(String, default="not_started", server_default="not_started")
    # Last step that finished, so a restarted worker resumes instead of starting over.
    pipeline_step: Mapped[str | None] = mapped_column(String)
    pipeline_error: Mapped[str | None] = mapped_column(Text)
    # How hard this submission is to grade (1-100), per the AI review; used to balance TA workloads.
    difficulty: Mapped[int | None] = mapped_column(Integer)
    difficulty_reason: Mapped[str | None] = mapped_column(Text)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    assigned_ta_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    # Set when automatic anonymization may have missed the student's name.
    needs_anonymization_check: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    assigned_ta: Mapped["User | None"] = relationship(foreign_keys=[assigned_ta_id])
    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    answers: Mapped[list["Answer"]] = relationship(back_populates="submission")
    files: Mapped[list["SubmissionFile"]] = relationship(back_populates="submission")
    # Eager so every SubmissionRead can report the PDF status without an async lazy load.
    document: Mapped["SubmissionDocument | None"] = relationship(back_populates="submission", lazy="selectin")
    annotations: Mapped[list["SubmissionAnnotation"]] = relationship(back_populates="submission")
    redactions: Mapped[list["SubmissionRedaction"]] = relationship(back_populates="submission")


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
    # What TAs see: the same PDF with the student's identity removed.
    anonymized_pdf_path: Mapped[str | None] = mapped_column(String)
    # Per-page text ({"page", "text", "source": "pdf" | "ocr", "confidence"}), from the PDF or OCR.
    page_texts: Mapped[list | None] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    submission: Mapped["Submission"] = relationship(back_populates="document")


class SubmissionAnnotation(Base):
    """A comment anchored to a spot (area or text highlight) of the merged PDF.

    TA comments are published right away. AI comments start as "suggested"
    (TA-only) until a TA accepts them, which publishes them as that TA's.
    """

    __tablename__ = "submission_annotations"
    __table_args__ = (
        CheckConstraint("source IN ('ta', 'ai')", name="ck_submission_annotations_source"),
        CheckConstraint(
            "status IN ('published', 'suggested', 'dismissed')", name="ck_submission_annotations_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    # Null for AI suggestions that no TA has accepted yet.
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    source: Mapped[str] = mapped_column(String, default="ta", server_default="ta")
    status: Mapped[str] = mapped_column(String, default="published", server_default="published")
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
    author: Mapped["User | None"] = relationship()


class SubmissionRedaction(Base):
    """A box blacked out in the anonymized PDF: found automatically or drawn by a TA."""

    __tablename__ = "submission_redactions"
    __table_args__ = (CheckConstraint("source IN ('auto', 'manual')", name="ck_submission_redactions_source"),)

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    page: Mapped[int] = mapped_column(Integer)
    # Same format as annotation rects: fractions (0-1) of the page size.
    rects: Mapped[list] = mapped_column(JSONB)
    source: Mapped[str] = mapped_column(String)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submission: Mapped["Submission"] = relationship(back_populates="redactions")
