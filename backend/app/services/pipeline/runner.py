"""Runs one submission through the pipeline, resuming after the last finished step."""

import logging
import uuid

from sqlalchemy import func, select, text

from app.db.session import AsyncSessionLocal
from app.models.submission import Submission, SubmissionDocument, SubmissionRedaction
from app.services.pdf_conversion import build_submission_pdf
from app.services.pipeline.anonymize import build_anonymized_pdf
from app.services.pipeline.distribute import distribute_assignment
from app.services.pipeline.extract import extract_text, needs_anonymization_check
from app.services.pipeline.review import review_submission

logger = logging.getLogger(__name__)


async def _ensure_pdf(submission_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        doc = await db.get(SubmissionDocument, submission_id)
        ready = doc is not None and doc.status == "ready"
    if not ready:
        await build_submission_pdf(submission_id)
        async with AsyncSessionLocal() as db:
            doc = await db.get(SubmissionDocument, submission_id)
            if doc is None or doc.status != "ready":
                raise RuntimeError("No se pudo generar el PDF de la entrega")


async def _anonymize(submission_id: uuid.UUID) -> None:
    await build_anonymized_pdf(submission_id)
    async with AsyncSessionLocal() as db:
        doc = await db.get(SubmissionDocument, submission_id)
        pages = set(
            (
                await db.execute(
                    select(SubmissionRedaction.page).where(
                        SubmissionRedaction.submission_id == submission_id, SubmissionRedaction.source == "auto"
                    )
                )
            ).scalars()
        )
        submission = await db.get(Submission, submission_id)
        submission.needs_anonymization_check = needs_anonymization_check(doc.page_texts or [], pages)
        await db.commit()


STEPS = [
    ("pdf", _ensure_pdf),
    ("extract", extract_text),
    ("anonymize", _anonymize),
    ("review", review_submission),
]


async def process_submission(submission_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        submission = await db.get(Submission, submission_id)
        done_steps = [name for name, _ in STEPS]
        start = done_steps.index(submission.pipeline_step) + 1 if submission.pipeline_step in done_steps else 0
        assignment_id = submission.assignment_id

    for name, step in STEPS[start:]:
        try:
            await step(submission_id)
        except Exception as exc:
            logger.exception("Pipeline step %s failed for submission %s", name, submission_id)
            async with AsyncSessionLocal() as db:
                submission = await db.get(Submission, submission_id)
                submission.pipeline_status = "failed"
                submission.pipeline_error = f"{name}: {exc}"[:1000]
                await db.commit()
            break
        async with AsyncSessionLocal() as db:
            submission = await db.get(Submission, submission_id)
            submission.pipeline_step = name
            await db.commit()
    else:
        async with AsyncSessionLocal() as db:
            submission = await db.get(Submission, submission_id)
            submission.pipeline_status = "done"
            submission.pipeline_error = None
            await db.commit()

    await distribute_if_complete(assignment_id)


async def distribute_if_complete(assignment_id: uuid.UUID) -> None:
    """Share out the assignment once none of its submissions are still waiting or running."""
    async with AsyncSessionLocal() as db:
        # Serializes this check-and-distribute per assignment across concurrent finishers.
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": str(assignment_id)})
        pending = await db.scalar(
            select(func.count())
            .select_from(Submission)
            .where(
                Submission.assignment_id == assignment_id,
                Submission.pipeline_status.in_(["queued", "processing"]),
            )
        )
        if pending:
            return
        assigned = await distribute_assignment(assignment_id)
        if assigned:
            logger.info("Assigned %s submissions of assignment %s to TAs", assigned, assignment_id)
        await db.commit()
