import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.assignment import Assignment, Question
from app.models.section import Section, SectionMember
from app.schemas.assignment import AssignmentCreate, AssignmentRead, CourseAssignments

router = APIRouter()


@router.get("/", response_model=list[AssignmentRead])
async def list_assignments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assignment).options(selectinload(Assignment.questions)))
    return result.scalars().all()


@router.get("/student/{user_id}", response_model=list[CourseAssignments])
async def list_student_assignments(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Assignment)
        .join(Assignment.section)
        .join(Section.members)
        .where(SectionMember.user_id == user_id)
        .options(
            selectinload(Assignment.section).selectinload(Section.course),
        )
        .order_by(Assignment.created_at)
    )
    result = await db.execute(stmt)
    assignments = result.scalars().all()

    grouped: dict[str, list] = defaultdict(list)
    course_map = {}
    for a in assignments:
        cid = str(a.section.course.id)
        if cid not in course_map:
            course_map[cid] = a.section.course
        grouped[cid].append(a)

    return [{"course": course_map[cid], "assignments": grouped[cid]} for cid in course_map]


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
