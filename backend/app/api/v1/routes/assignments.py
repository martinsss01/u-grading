from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.assignment import Assignment, Question
from app.schemas.assignment import AssignmentCreate, AssignmentRead

router = APIRouter()


@router.get("/", response_model=list[AssignmentRead])
async def list_assignments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assignment).options(selectinload(Assignment.questions)))
    return result.scalars().all()


@router.post("/", response_model=AssignmentRead, status_code=201)
async def create_assignment(payload: AssignmentCreate, db: AsyncSession = Depends(get_db)):
    assignment = Assignment(
        section_id=payload.section_id,
        title=payload.title,
        type=payload.type,
        rubric=payload.rubric,
        due_date=payload.due_date,
        questions=[
            Question(number=q.number, description=q.description, max_points=q.max_points)
            for q in payload.questions
        ],
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment, attribute_names=["questions"])
    return assignment
