import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.assignment import Assignment, Question
from app.models.enums import Role
from app.models.section import Section, SectionMember
from app.models.submission import Answer, Submission
from app.schemas.assignment import AssignmentCreate, AssignmentDetail, AssignmentRead, AssignmentUpdate, CourseAssignments
from app.schemas.submission import SubmissionRead

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

    grade_map: dict[uuid.UUID, float] = {}
    if assignments:
        # A student can have several submissions per assignment (re-uploads before
        # the due date); only the latest one's grades should count.
        sub_stmt = select(Submission.id, Submission.assignment_id, Submission.created_at).where(
            Submission.user_id == user_id,
            Submission.assignment_id.in_([a.id for a in assignments]),
        )
        sub_rows = await db.execute(sub_stmt)
        latest_submission_ids: dict[uuid.UUID, tuple[uuid.UUID, object]] = {}
        for sub_id, assignment_id, created_at in sub_rows.all():
            current = latest_submission_ids.get(assignment_id)
            if current is None or created_at > current[1]:
                latest_submission_ids[assignment_id] = (sub_id, created_at)
        latest_ids = [sub_id for sub_id, _ in latest_submission_ids.values()]

        grade_map = {}
        if latest_ids:
            grade_stmt = (
                select(Submission.assignment_id, func.avg(Answer.grade))
                .join(Answer, Answer.submission_id == Submission.id)
                .where(Submission.id.in_(latest_ids))
                .group_by(Submission.assignment_id)
            )
            grade_rows = await db.execute(grade_stmt)
            grade_map = {assignment_id: avg_grade for assignment_id, avg_grade in grade_rows.all() if avg_grade is not None}

    grouped: dict[str, list] = defaultdict(list)
    course_map = {}
    for a in assignments:
        cid = str(a.section.course.id)
        if cid not in course_map:
            course_map[cid] = a.section.course
        grouped[cid].append({
            "id": a.id,
            "title": a.title,
            "type": a.type,
            "status": a.status,
            "due_date": a.due_date,
            "section": a.section,
            "grade": grade_map.get(a.id),
        })

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
async def get_assignment(assignment_id: uuid.UUID, user_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .where(Assignment.id == assignment_id)
        .options(
            selectinload(Assignment.questions),
            selectinload(Assignment.section).selectinload(Section.course),
        )
    )
    assignment = result.scalar_one()

    answer_grades = None
    submission_history: list[SubmissionRead] = []
    if user_id is not None:
        ans_stmt = (
            select(Answer.question_id, Answer.grade)
            .join(Submission, Answer.submission_id == Submission.id)
            .where(Submission.assignment_id == assignment_id, Submission.user_id == user_id)
        )
        ans_rows = await db.execute(ans_stmt)
        answer_grades = [{"question_id": qid, "grade": grade} for qid, grade in ans_rows.all()]

        sub_stmt = (
            select(Submission)
            .where(Submission.assignment_id == assignment_id, Submission.user_id == user_id)
            .options(selectinload(Submission.answers), selectinload(Submission.files))
            .order_by(Submission.created_at.desc())
        )
        sub_result = await db.execute(sub_stmt)
        submission_history = [SubmissionRead.model_validate(s) for s in sub_result.scalars().all()]

    detail = AssignmentDetail.model_validate(assignment)
    return detail.model_copy(update={"answer_grades": answer_grades, "submission_history": submission_history})


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
            selectinload(Assignment.submissions).selectinload(Submission.files),
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404)

    for sub in assignment.submissions:
        for ans in sub.answers:
            await db.delete(ans)
        for f in sub.files:
            await db.delete(f)
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
        open_date=payload.open_date,
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
