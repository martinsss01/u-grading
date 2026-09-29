"""Background worker: starts the pipeline for closed assignments and runs queued submissions.

State lives in the database (pipeline_status / pipeline_step), so the worker
can restart at any time and pick up where it left off. It runs inside the API
process as an asyncio task; with several API processes, SKIP LOCKED keeps
them from claiming the same submission.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.services.pipeline.runner import process_submission

logger = logging.getLogger(__name__)

POLL_SECONDS = 30
MAX_CONCURRENT = 3

_wake = asyncio.Event()


def wake() -> None:
    """Check for work now instead of at the next poll (e.g. after a manual run)."""
    _wake.set()


def latest_per_user(submissions: list[Submission]) -> list[Submission]:
    """Reduce a list of submissions to the newest one per student."""
    latest: dict[uuid.UUID, Submission] = {}
    for s in submissions:
        current = latest.get(s.user_id)
        if current is None or s.created_at > current.created_at:
            latest[s.user_id] = s
    return list(latest.values())


async def queue_assignment(db: AsyncSession, assignment: Assignment, force: bool = False) -> int:
    """Queue each student's latest submission. Without `force`, finished ones are left alone."""
    assignment.pipeline_started_at = assignment.pipeline_started_at or datetime.now(timezone.utc)
    submissions = (
        await db.execute(select(Submission).where(Submission.assignment_id == assignment.id))
    ).scalars().all()
    queued = 0
    for s in latest_per_user(list(submissions)):
        previous = s.pipeline_status
        if previous in ("queued", "processing") or (previous == "done" and not force):
            continue
        s.pipeline_status = "queued"
        s.pipeline_error = None
        # A failed run resumes after its last finished step; a forced re-run starts over.
        if force or previous == "not_started":
            s.pipeline_step = None
        queued += 1
    return queued


async def _enqueue_closed_assignments() -> None:
    async with AsyncSessionLocal() as db:
        closed = (
            await db.execute(
                select(Assignment)
                .where(Assignment.due_date <= datetime.now(timezone.utc), Assignment.pipeline_started_at.is_(None))
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        for assignment in closed:
            count = await queue_assignment(db, assignment)
            logger.info("Assignment %s closed: queued %s submissions", assignment.id, count)
        await db.commit()


async def _claim(limit: int) -> list[uuid.UUID]:
    async with AsyncSessionLocal() as db:
        ids = (
            await db.execute(
                select(Submission.id)
                .where(Submission.pipeline_status == "queued")
                .order_by(Submission.created_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        if ids:
            await db.execute(update(Submission).where(Submission.id.in_(ids)).values(pipeline_status="processing"))
        await db.commit()
        return list(ids)


async def _reset_interrupted() -> None:
    """Submissions left 'processing' by a previous run (crash/restart) go back to the queue."""
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Submission).where(Submission.pipeline_status == "processing").values(pipeline_status="queued")
        )
        await db.commit()


async def run_worker() -> None:
    await _reset_interrupted()
    running: set[asyncio.Task] = set()
    warned_no_key = False
    while True:
        try:
            await _enqueue_closed_assignments()
            if not settings.OPENROUTER_API_KEY:
                if not warned_no_key:
                    logger.warning("OPENROUTER_API_KEY not set: queued submissions will wait")
                    warned_no_key = True
            elif (free := MAX_CONCURRENT - len(running)) > 0:
                for submission_id in await _claim(free):
                    task = asyncio.create_task(process_submission(submission_id))
                    running.add(task)
                    task.add_done_callback(lambda t: (running.discard(t), wake()))
        except Exception:
            logger.exception("Pipeline worker tick failed")
        try:
            await asyncio.wait_for(_wake.wait(), timeout=POLL_SECONDS)
        except TimeoutError:
            pass
        _wake.clear()
