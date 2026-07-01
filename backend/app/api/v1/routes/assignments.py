import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.assignment import Assignment, Question
from app.models.enums import Role
from app.models.section import Section, SectionMember
from app.models.submission import Submission
from app.schemas.assignment import AssignmentCreate, AssignmentDetail, AssignmentRead, AssignmentUpdate, CourseAssignments

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


@router.get("/teacher/{user_id}", response_model=list[AssignmentRead])
async def list_teacher_assignments(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .join(Assignment.section)
        .join(Section.members)
        .where(SectionMember.user_id == user_id, SectionMember.role == Role.TEACHER)
        .options(selectinload(Assignment.questions))
        .order_by(Assignment.created_at)
    )
    return result.scalars().all()


@router.get("/{assignment_id}", response_model=AssignmentDetail)
async def get_assignment(assignment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .where(Assignment.id == assignment_id)
        .options(
            selectinload(Assignment.questions),
            selectinload(Assignment.section).selectinload(Section.course),
        )
    )
    return result.scalar_one()


@router.patch("/{assignment_id}", response_model=AssignmentRead)
async def update_assignment(assignment_id: uuid.UUID, payload: AssignmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .where(Assignment.id == assignment_id)
        .options(selectinload(Assignment.questions))
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404)

    update_data = payload.model_dump(exclude_unset=True)
    questions_data = update_data.pop("questions", None)

    for field, value in update_data.items():
        setattr(assignment, field, value)

    if questions_data is not None:
        for q in list(assignment.questions):
            await db.delete(q)
        await db.flush()
        for q in questions_data:
            db.add(Question(
                assignment_id=assignment.id,
                number=q["number"],
                description=q["description"],
                max_points=q["max_points"],
            ))

    await db.commit()
    await db.refresh(assignment, attribute_names=["questions"])
    return assignment


@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(assignment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .where(Assignment.id == assignment_id)
        .options(
            selectinload(Assignment.questions),
            selectinload(Assignment.submissions).selectinload(Submission.answers),
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404)

    for sub in assignment.submissions:
        for ans in sub.answers:
            await db.delete(ans)
        await db.delete(sub)
    for q in assignment.questions:
        await db.delete(q)
    await db.delete(assignment)
    await db.commit()


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
