import shutil
import uuid
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

    # Strip any client-supplied path, keep only the filename.
    safe_filename = Path(file.filename or "archivo").name
    dest_dir = Path(settings.UPLOAD_DIR) / str(assignment_id) / str(user_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / safe_filename

    with dest_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    result = await db.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.user_id == user_id,
        )
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        submission = Submission(assignment_id=assignment_id, user_id=user_id)
        db.add(submission)

    submission.file_path = str(dest_path)
    submission.needs_checking = True
    assignment.status = AssignmentStatus.GRADING

    await db.commit()
    await db.refresh(submission)
    return submission


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
                "submissions": a.submissions,
            }
            for a in assignments
        ],
    }
