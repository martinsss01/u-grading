import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.section import Section
from app.models.submission import Submission
from app.schemas.submission import SectionSubmissions

router = APIRouter()


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
