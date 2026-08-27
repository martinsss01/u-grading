import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus
from app.models.section import Section
from app.models.submission import Submission
from app.schemas.submission import SectionSubmissions, SubmissionCreated

router = APIRouter()


@router.post("/", response_model=SubmissionCreated, status_code=201)
async def create_submission(
    assignment_id: uuid.UUID = Form(...),
    user_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    assignment = await db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if assignment.due_date is not None and datetime.now(timezone.utc) >= assignment.due_date:
        raise HTTPException(status_code=403, detail="La fecha de entrega ya pasó")

    # Strip any client-supplied path, keep only the filename.
    safe_filename = Path(file.filename or "archivo").name
    submission_id = uuid.uuid4()
    dest_dir = Path(settings.UPLOAD_DIR) / str(assignment_id) / str(user_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Prefix with the submission id so re-uploads don't overwrite prior files —
    # every upload is kept as its own history entry.
    dest_path = dest_dir / f"{submission_id}_{safe_filename}"

    with dest_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    submission = Submission(
        id=submission_id,
        assignment_id=assignment_id,
        user_id=user_id,
        file_path=str(dest_path),
        needs_checking=True,
    )
    db.add(submission)
    assignment.status = AssignmentStatus.GRADING

    await db.commit()
    await db.refresh(submission)
    return submission


def _latest_per_user(submissions: list[Submission]) -> list[Submission]:
    """Reduce a list of submissions to the newest one per student."""
    latest: dict[uuid.UUID, Submission] = {}
    for s in submissions:
        current = latest.get(s.user_id)
        if current is None or s.created_at > current.created_at:
            latest[s.user_id] = s
    return list(latest.values())


@router.get("/section/{section_id}", response_model=SectionSubmissions)
async def list_section_submissions(section_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    section_result = await db.execute(
        select(Section)
        .where(Section.id == section_id)
        .options(selectinload(Section.course))
    )
    section = section_result.scalar_one()

    assignments_result = await db.execute(
        select(Assignment)
        .where(Assignment.section_id == section_id)
        .options(
            selectinload(Assignment.submissions).selectinload(Submission.answers),
        )
        .order_by(Assignment.created_at)
    )
    assignments = assignments_result.scalars().all()

    return {
        "section": section,
        "assignments": [
            {
                "id": a.id,
                "title": a.title,
                "type": a.type,
                "submissions": _latest_per_user(a.submissions),
            }
            for a in assignments
        ],
    }
