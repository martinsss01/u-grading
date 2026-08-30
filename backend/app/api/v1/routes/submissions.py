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
from app.models.submission import Submission, SubmissionFile
from app.schemas.submission import SectionSubmissions, SubmissionRead

router = APIRouter()


@router.post("/", response_model=SubmissionRead, status_code=201)
async def create_submission(
    assignment_id: uuid.UUID = Form(...),
    user_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    # Pass the id of an already-open submission (from an earlier response in
    # this same page visit) to add another file to it, instead of starting a
    # brand-new submission entry.
    submission_id: uuid.UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    assignment = await db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if assignment.due_date is not None and datetime.now(timezone.utc) >= assignment.due_date:
        raise HTTPException(status_code=403, detail="La fecha de entrega ya pasó")

    submission: Submission | None = None
    if submission_id is not None:
        submission = await db.get(Submission, submission_id)
        if submission is None or submission.assignment_id != assignment_id or submission.user_id != user_id:
            raise HTTPException(status_code=404, detail="Submission not found")

    # Strip any client-supplied path, keep only the filename.
    safe_filename = Path(file.filename or "archivo").name
    file_id = uuid.uuid4()
    dest_dir = Path(settings.UPLOAD_DIR) / str(assignment_id) / str(user_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Prefix with the file id so files never collide on disk.
    dest_path = dest_dir / f"{file_id}_{safe_filename}"

    with dest_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    if submission is None:
        submission = Submission(assignment_id=assignment_id, user_id=user_id, needs_checking=True)
        db.add(submission)
        await db.flush()  # assign submission.id for the file's FK below

    db.add(SubmissionFile(id=file_id, submission_id=submission.id, file_path=str(dest_path), filename=safe_filename))
    submission.needs_checking = True
    assignment.status = AssignmentStatus.GRADING

    await db.commit()
    await db.refresh(submission, attribute_names=["files", "answers"])
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
            selectinload(Assignment.submissions).selectinload(Submission.files),
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
