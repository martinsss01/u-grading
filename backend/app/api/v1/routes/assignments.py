import shutil
import uuid
from collections import defaultdict
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.permissions import can_review_assignment, is_assignment_teacher
from app.api.v1.routes.submissions import REVIEW_LOAD_OPTIONS, review_view
from app.core.config import settings
from app.db.session import get_db
from app.models.assignment import Assignment, Question
from app.models.enums import AssignmentStatus, Role
from app.models.section import Section, SectionMember
from app.models.submission import Answer, Submission
from app.schemas.assignment import AssignmentCreate, AssignmentDetail, AssignmentRead, AssignmentUpdate, CourseAssignments
from app.schemas.submission import PipelineOverview, PipelineRun, SubmissionRead, TaLoad
from app.services.pipeline import worker
from app.services.pipeline.worker import latest_per_user

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
        .where(SectionMember.user_id == user_id, SectionMember.role == Role.STUDENT)
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
            "open_date": a.open_date,
            "due_date": a.due_date,
            "section": a.section,
            "grade": grade_map.get(a.id),
        })

    return [{"course": course_map[cid], "assignments": grouped[cid]} for cid in course_map]


@router.get("/ta/{user_id}", response_model=list[CourseAssignments])
async def list_ta_assignments(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Assignment)
        .join(Assignment.section)
        .join(Section.members)
        .where(SectionMember.user_id == user_id, SectionMember.role == Role.TA)
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
        grouped[cid].append({
            "id": a.id,
            "title": a.title,
            "type": a.type,
            "status": a.status,
            "open_date": a.open_date,
            "due_date": a.due_date,
            "section": a.section,
            # Not meaningful for a TA's own view of the assignment.
            "grade": None,
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

    # Reopened (due date moved to the future): run the AI pipeline again when it closes.
    if assignment.status != AssignmentStatus.CLOSED:
        assignment.pipeline_started_at = None

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


@router.post("/{assignment_id}/file", response_model=AssignmentRead)
async def upload_assignment_file(assignment_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Attach (or replace) the evaluation document professors upload instead
    of typing questions in by hand."""
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id).options(selectinload(Assignment.questions))
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404)

    old_path = assignment.file_path

    safe_filename = Path(file.filename or "archivo").name
    dest_dir = Path(settings.UPLOAD_DIR) / "assignments" / str(assignment_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"{uuid.uuid4()}_{safe_filename}"

    with dest_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    assignment.file_path = str(dest_path)
    assignment.filename = safe_filename
    await db.commit()
    await db.refresh(assignment, attribute_names=["questions"])

    if old_path and old_path != str(dest_path):
        Path(old_path).unlink(missing_ok=True)

    return assignment


@router.get("/{assignment_id}/file")
async def download_assignment_file(assignment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    assignment = await db.get(Assignment, assignment_id)
    if not assignment or not assignment.file_path:
        raise HTTPException(status_code=404, detail="No hay archivo adjunto")
    return FileResponse(assignment.file_path, filename=assignment.filename)


GUIDELINE_EXTENSIONS = {".pdf", ".txt", ".md"}


@router.post("/{assignment_id}/guideline", response_model=AssignmentRead)
async def upload_assignment_guideline(
    assignment_id: uuid.UUID,
    user_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Attach (or replace) the private grading guideline the AI review uses.
    Only the section's teachers can set it; students never see it."""
    if not await is_assignment_teacher(db, user_id, assignment_id):
        raise HTTPException(status_code=403, detail="Solo el profesor puede subir la pauta")
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id).options(selectinload(Assignment.questions))
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404)

    safe_filename = Path(file.filename or "pauta").name
    if Path(safe_filename).suffix.lower() not in GUIDELINE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="La pauta debe ser PDF, .txt o .md")

    old_path = assignment.guideline_path
    dest_dir = Path(settings.UPLOAD_DIR) / "assignments" / str(assignment_id) / "guideline"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"{uuid.uuid4()}_{safe_filename}"
    with dest_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    assignment.guideline_path = str(dest_path)
    assignment.guideline_filename = safe_filename
    await db.commit()
    await db.refresh(assignment, attribute_names=["questions"])

    if old_path and old_path != str(dest_path):
        Path(old_path).unlink(missing_ok=True)
    return assignment


@router.get("/{assignment_id}/guideline")
async def download_assignment_guideline(
    assignment_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    if not await can_review_assignment(db, user_id, assignment_id):
        raise HTTPException(status_code=403, detail="La pauta es solo para el equipo docente")
    assignment = await db.get(Assignment, assignment_id)
    if not assignment or not assignment.guideline_path:
        raise HTTPException(status_code=404, detail="No hay pauta")
    return FileResponse(
        assignment.guideline_path, filename=assignment.guideline_filename, content_disposition_type="inline"
    )


@router.delete("/{assignment_id}/guideline", status_code=204)
async def delete_assignment_guideline(
    assignment_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    if not await is_assignment_teacher(db, user_id, assignment_id):
        raise HTTPException(status_code=403, detail="Solo el profesor puede borrar la pauta")
    assignment = await db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404)
    if assignment.guideline_path:
        Path(assignment.guideline_path).unlink(missing_ok=True)
    assignment.guideline_path = None
    assignment.guideline_filename = None
    await db.commit()


async def _pipeline_overview(db: AsyncSession, assignment_id: uuid.UUID) -> PipelineOverview:
    result = await db.execute(
        select(Assignment)
        .where(Assignment.id == assignment_id)
        .options(selectinload(Assignment.submissions).options(*REVIEW_LOAD_OPTIONS))
        .execution_options(populate_existing=True)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=404)
    submissions = [review_view(s) for s in latest_per_user(assignment.submissions)]
    submissions.sort(key=lambda s: (s.difficulty is None, -(s.difficulty or 0)))

    tas = (
        await db.execute(
            select(SectionMember)
            .where(SectionMember.section_id == assignment.section_id, SectionMember.role == Role.TA)
            .options(selectinload(SectionMember.user))
        )
    ).scalars().all()
    loads = []
    for member in sorted(tas, key=lambda m: m.user.name):
        mine = [s for s in submissions if s.assigned_ta_id == member.user_id]
        loads.append(
            TaLoad(
                id=member.user_id,
                name=member.user.name,
                count=len(mine),
                total_difficulty=sum(s.difficulty or 0 for s in mine),
            )
        )
    return PipelineOverview(
        assignment_id=assignment.id,
        title=assignment.title,
        status=assignment.status,
        pipeline_started_at=assignment.pipeline_started_at,
        has_guideline=assignment.guideline_path is not None,
        tas=loads,
        submissions=submissions,
    )


@router.get("/{assignment_id}/pipeline", response_model=PipelineOverview)
async def get_pipeline_overview(assignment_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """AI pipeline progress, difficulty and TA workload for one assignment (teaching staff only)."""
    if not await can_review_assignment(db, user_id, assignment_id):
        raise HTTPException(status_code=403, detail="Solo el equipo docente puede ver esto")
    return await _pipeline_overview(db, assignment_id)


@router.post("/{assignment_id}/pipeline/run", response_model=PipelineOverview)
async def run_pipeline(assignment_id: uuid.UUID, body: PipelineRun, db: AsyncSession = Depends(get_db)):
    """Start the pipeline now (without waiting for the due date), or re-run it with `force`."""
    if not await can_review_assignment(db, body.user_id, assignment_id):
        raise HTTPException(status_code=403, detail="Solo el equipo docente puede procesar entregas")
    assignment = await db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404)
    await worker.queue_assignment(db, assignment, force=body.force)
    await db.commit()
    worker.wake()
    return await _pipeline_overview(db, assignment_id)
