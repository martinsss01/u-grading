import io
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.permissions import can_review_assignment, is_assignment_teacher
from app.core.config import settings
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, Role
from app.models.section import Section, SectionMember
from app.models.submission import (
    Submission,
    SubmissionAnnotation,
    SubmissionDocument,
    SubmissionFile,
    SubmissionRedaction,
)
from app.schemas.submission import (
    AnnotationAccept,
    AnnotationCreate,
    AnnotationRead,
    AnnotationUpdate,
    AssigneeUpdate,
    ColabSubmissionCreate,
    PipelineRun,
    RedactionCreate,
    RedactionRead,
    ReviewSubmissionRead,
    SectionSubmissions,
    SubmissionDocumentRead,
    SubmissionFileRead,
    SubmissionRead,
)
from app.services.colab import ColabFetchError, fetch_colab_notebook
from app.services.pdf_conversion import build_submission_pdf, read_text, upload_order
from app.services.pipeline import worker
from app.services.pipeline.anonymize import build_anonymized_pdf
from app.services.pipeline.identity import identity_regex, identity_terms, replace_with_label
from app.services.pipeline.worker import latest_per_user

router = APIRouter()


async def _open_assignment(db: AsyncSession, assignment_id: uuid.UUID) -> Assignment:
    assignment = await db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    status = assignment.status
    if status == AssignmentStatus.PENDING:
        raise HTTPException(status_code=403, detail="La evaluación aún no está abierta")
    if status == AssignmentStatus.CLOSED:
        raise HTTPException(status_code=403, detail="La fecha de entrega ya pasó")
    return assignment


async def _existing_submission(
    db: AsyncSession, submission_id: uuid.UUID | None, assignment_id: uuid.UUID, user_id: uuid.UUID
) -> Submission | None:
    if submission_id is None:
        return None
    submission = await db.get(Submission, submission_id)
    if submission is None or submission.assignment_id != assignment_id or submission.user_id != user_id:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


async def _save_file(
    db: AsyncSession,
    background: BackgroundTasks,
    submission: Submission | None,
    assignment_id: uuid.UUID,
    user_id: uuid.UUID,
    filename: str,
    source: BinaryIO,
    comment: str | None = None,
) -> Submission:
    """Store one file on disk, attach it to (a new or given) submission and queue its PDF rebuild."""
    # Strip any client-supplied path, keep only the filename.
    safe_filename = Path(filename or "archivo").name
    file_id = uuid.uuid4()
    dest_dir = Path(settings.UPLOAD_DIR) / str(assignment_id) / str(user_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Prefix with the file id so files never collide on disk.
    dest_path = dest_dir / f"{file_id}_{safe_filename}"

    with dest_path.open("wb") as out:
        shutil.copyfileobj(source, out)

    if submission is None:
        submission = Submission(assignment_id=assignment_id, user_id=user_id, needs_checking=True)
        db.add(submission)
        await db.flush()  # assign submission.id for the file's FK below

    db.add(SubmissionFile(id=file_id, submission_id=submission.id, file_path=str(dest_path), filename=safe_filename))
    submission.needs_checking = True
    # Files of one submission can arrive in several requests; the latest comment wins.
    if comment and comment.strip():
        submission.student_comment = comment.strip()
    await _mark_document_pending(db, submission.id)

    await db.commit()
    await db.refresh(submission, attribute_names=["files", "answers", "document"])
    background.add_task(build_submission_pdf, submission.id)
    return submission


async def _mark_document_pending(db: AsyncSession, submission_id: uuid.UUID) -> None:
    doc = await db.get(SubmissionDocument, submission_id)
    if doc is None:
        db.add(SubmissionDocument(submission_id=submission_id, status="pending"))
    else:
        doc.status = "pending"
        doc.error = None


@router.post("/", response_model=SubmissionRead, status_code=201)
async def create_submission(
    background: BackgroundTasks,
    assignment_id: uuid.UUID = Form(...),
    user_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    # Pass the id of an already-open submission (from an earlier response in
    # this same page visit) to add another file to it, instead of starting a
    # brand-new submission entry.
    submission_id: uuid.UUID | None = Form(None),
    comment: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    await _open_assignment(db, assignment_id)
    submission = await _existing_submission(db, submission_id, assignment_id, user_id)
    return await _save_file(
        db, background, submission, assignment_id, user_id, file.filename or "archivo", file.file, comment
    )


@router.post("/colab", response_model=SubmissionRead, status_code=201)
async def create_colab_submission(
    body: ColabSubmissionCreate, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
):
    """Snapshot a Colab notebook (fetched from its share link) as an .ipynb file of the submission."""
    await _open_assignment(db, body.assignment_id)
    submission = await _existing_submission(db, body.submission_id, body.assignment_id, body.user_id)
    try:
        filename, content = await fetch_colab_notebook(body.url)
    except ColabFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await _save_file(
        db, background, submission, body.assignment_id, body.user_id, filename, io.BytesIO(content), body.comment
    )


@router.get("/files/{file_id}")
async def download_submission_file(file_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    file = await db.get(SubmissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(file.file_path, filename=file.filename)


@router.get("/{submission_id}/document", response_model=SubmissionDocumentRead)
async def get_submission_document(submission_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(SubmissionDocument, submission_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return doc


@router.get("/{submission_id}/document.pdf")
async def get_submission_document_pdf(submission_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(SubmissionDocument, submission_id)
    # Once the pipeline anonymized it, everyone (TAs and the student) sees the
    # anonymized copy, so comments line up on the same pages for both.
    path = doc and (doc.anonymized_pdf_path or doc.pdf_path)
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    # Inline so browsers and the in-app viewer display it instead of downloading.
    return FileResponse(
        path,
        media_type="application/pdf",
        filename="entrega.pdf",
        content_disposition_type="inline",
        headers={"Cache-Control": "no-cache"},
    )


@router.post("/{submission_id}/document/rebuild", response_model=SubmissionDocumentRead, status_code=202)
async def rebuild_submission_document(
    submission_id: uuid.UUID, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
):
    if await db.get(Submission, submission_id) is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    await _mark_document_pending(db, submission_id)
    await db.commit()
    background.add_task(build_submission_pdf, submission_id)
    return await db.get(SubmissionDocument, submission_id)


def _annotation_read(a: SubmissionAnnotation) -> AnnotationRead:
    return AnnotationRead(
        id=a.id,
        submission_id=a.submission_id,
        author_id=a.author_id,
        author_name=a.author.name if a.author else "Asistente IA",
        source=a.source,
        status=a.status,
        page=a.page,
        position=a.position,
        highlighted_text=a.highlighted_text,
        comment=a.comment,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


async def _load_annotation(db: AsyncSession, annotation_id: uuid.UUID) -> SubmissionAnnotation:
    result = await db.execute(
        select(SubmissionAnnotation)
        .where(SubmissionAnnotation.id == annotation_id)
        .options(selectinload(SubmissionAnnotation.author))
        .execution_options(populate_existing=True)
    )
    annotation = result.scalar_one_or_none()
    if annotation is None:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    return annotation


async def _get_submission(db: AsyncSession, submission_id: uuid.UUID) -> Submission:
    submission = await db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


async def _require_reviewer(db: AsyncSession, user_id: uuid.UUID | None, submission: Submission) -> None:
    if not await can_review_assignment(db, user_id, submission.assignment_id):
        raise HTTPException(status_code=403, detail="Solo el equipo docente puede hacer esto")


@router.get("/{submission_id}/annotations", response_model=list[AnnotationRead])
async def list_annotations(
    submission_id: uuid.UUID, viewer_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)
):
    """Published comments for everyone; the teaching staff also get pending AI suggestions."""
    submission = await _get_submission(db, submission_id)
    statuses = ["published"]
    if await can_review_assignment(db, viewer_id, submission.assignment_id):
        statuses.append("suggested")
    result = await db.execute(
        select(SubmissionAnnotation)
        .where(SubmissionAnnotation.submission_id == submission_id, SubmissionAnnotation.status.in_(statuses))
        .options(selectinload(SubmissionAnnotation.author))
        .order_by(SubmissionAnnotation.page, SubmissionAnnotation.created_at)
    )
    return [_annotation_read(a) for a in result.scalars().all()]


@router.post("/{submission_id}/annotations", response_model=AnnotationRead, status_code=201)
async def create_annotation(submission_id: uuid.UUID, body: AnnotationCreate, db: AsyncSession = Depends(get_db)):
    submission = await db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if not await can_review_assignment(db, body.author_id, submission.assignment_id):
        raise HTTPException(status_code=403, detail="Solo el equipo docente puede comentar")
    annotation = SubmissionAnnotation(submission_id=submission_id, **body.model_dump())
    db.add(annotation)
    await db.commit()
    return _annotation_read(await _load_annotation(db, annotation.id))


async def _pending_suggestion(db: AsyncSession, annotation_id: uuid.UUID, user_id: uuid.UUID) -> SubmissionAnnotation:
    annotation = await _load_annotation(db, annotation_id)
    if annotation.source != "ai" or annotation.status != "suggested":
        raise HTTPException(status_code=409, detail="Este comentario no es una sugerencia pendiente")
    await _require_reviewer(db, user_id, await _get_submission(db, annotation.submission_id))
    return annotation


@router.post("/annotations/{annotation_id}/accept", response_model=AnnotationRead)
async def accept_suggestion(annotation_id: uuid.UUID, body: AnnotationAccept, db: AsyncSession = Depends(get_db)):
    """Publish an AI suggestion (optionally reworded) as the accepting TA's own comment."""
    annotation = await _pending_suggestion(db, annotation_id, body.author_id)
    annotation.status = "published"
    annotation.author_id = body.author_id
    if body.comment:
        annotation.comment = body.comment
    await db.commit()
    return _annotation_read(await _load_annotation(db, annotation_id))


@router.post("/annotations/{annotation_id}/dismiss", status_code=204)
async def dismiss_suggestion(annotation_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    annotation = await _pending_suggestion(db, annotation_id, user_id)
    annotation.status = "dismissed"
    await db.commit()


@router.patch("/annotations/{annotation_id}", response_model=AnnotationRead)
async def update_annotation(annotation_id: uuid.UUID, body: AnnotationUpdate, db: AsyncSession = Depends(get_db)):
    annotation = await _load_annotation(db, annotation_id)
    if annotation.author_id != body.author_id:
        raise HTTPException(status_code=403, detail="Solo el autor puede editar este comentario")
    annotation.comment = body.comment
    await db.commit()
    return _annotation_read(await _load_annotation(db, annotation_id))


@router.delete("/annotations/{annotation_id}", status_code=204)
async def delete_annotation(annotation_id: uuid.UUID, author_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    annotation = await _load_annotation(db, annotation_id)
    if annotation.author_id != author_id:
        raise HTTPException(status_code=403, detail="Solo el autor puede borrar este comentario")
    await db.delete(annotation)
    await db.commit()


@router.get("/{submission_id}/redactions", response_model=list[RedactionRead])
async def list_redactions(submission_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _require_reviewer(db, user_id, await _get_submission(db, submission_id))
    result = await db.execute(
        select(SubmissionRedaction)
        .where(SubmissionRedaction.submission_id == submission_id)
        .order_by(SubmissionRedaction.page, SubmissionRedaction.created_at)
    )
    return result.scalars().all()


async def _rebuild_anonymized(db: AsyncSession, submission_id: uuid.UUID) -> list[SubmissionRedaction]:
    try:
        await build_anonymized_pdf(submission_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    result = await db.execute(
        select(SubmissionRedaction)
        .where(SubmissionRedaction.submission_id == submission_id)
        .order_by(SubmissionRedaction.page, SubmissionRedaction.created_at)
        .execution_options(populate_existing=True)
    )
    return list(result.scalars().all())


@router.post("/{submission_id}/redactions", response_model=list[RedactionRead], status_code=201)
async def create_redaction(submission_id: uuid.UUID, body: RedactionCreate, db: AsyncSession = Depends(get_db)):
    """Black out a box a TA drew (e.g. a name the automatic pass missed) and rebuild the anonymized PDF."""
    await _require_reviewer(db, body.author_id, await _get_submission(db, submission_id))
    db.add(
        SubmissionRedaction(
            submission_id=submission_id, page=body.page, rects=body.rects, source="manual", author_id=body.author_id
        )
    )
    await db.commit()
    return await _rebuild_anonymized(db, submission_id)


@router.delete("/redactions/{redaction_id}", response_model=list[RedactionRead])
async def delete_redaction(redaction_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    redaction = await db.get(SubmissionRedaction, redaction_id)
    if redaction is None:
        raise HTTPException(status_code=404, detail="Censura no encontrada")
    submission_id = redaction.submission_id
    await _require_reviewer(db, user_id, await _get_submission(db, submission_id))
    await db.delete(redaction)
    await db.commit()
    return await _rebuild_anonymized(db, submission_id)


@router.post("/{submission_id}/anonymization-checked", status_code=204)
async def mark_anonymization_checked(submission_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    submission = await _get_submission(db, submission_id)
    await _require_reviewer(db, user_id, submission)
    submission.needs_anonymization_check = False
    await db.commit()


@router.get("/files/{file_id}/anonymized")
async def download_anonymized_file(file_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """A text/code file with the student's identity replaced, under a neutral name (for TAs)."""
    file = await db.get(SubmissionFile, file_id)
    if file is None:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    result = await db.execute(
        select(Submission)
        .where(Submission.id == file.submission_id)
        .options(selectinload(Submission.user), selectinload(Submission.files))
    )
    submission = result.scalar_one()
    await _require_reviewer(db, user_id, submission)
    text = read_text(Path(file.file_path))
    if text is None:
        raise HTTPException(status_code=404, detail="Solo los archivos de texto o código se pueden descargar anonimizados")
    pattern = identity_regex(identity_terms(submission.user.name, submission.user.email))
    number = [f.id for f in upload_order(submission.files)].index(file.id) + 1
    name = f"archivo_{number}{Path(file.filename).suffix.lower()}"
    return Response(
        replace_with_label(text, pattern).encode(),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/{submission_id}/pipeline/retry", response_model=ReviewSubmissionRead)
async def retry_pipeline(submission_id: uuid.UUID, body: PipelineRun, db: AsyncSession = Depends(get_db)):
    """Queue one submission again: resumes after its last finished step, or starts over with `force`."""
    submission = await _get_submission(db, submission_id)
    await _require_reviewer(db, body.user_id, submission)
    if submission.pipeline_status in ("queued", "processing"):
        raise HTTPException(status_code=409, detail="La entrega ya se está procesando")
    submission.pipeline_status = "queued"
    submission.pipeline_error = None
    if body.force:
        submission.pipeline_step = None
    await db.commit()
    worker.wake()
    return review_view(await load_for_review(db, submission_id))


REVIEW_LOAD_OPTIONS = (
    selectinload(Submission.answers),
    selectinload(Submission.files),
    selectinload(Submission.user),
    selectinload(Submission.assigned_ta),
)


async def load_for_review(db: AsyncSession, submission_id: uuid.UUID) -> Submission:
    result = await db.execute(
        select(Submission)
        .where(Submission.id == submission_id)
        .options(*REVIEW_LOAD_OPTIONS)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


def review_view(s: Submission) -> ReviewSubmissionRead:
    """A submission as TAs see it: filenames and the student's comment anonymized, plus pipeline results."""
    pattern = identity_regex(identity_terms(s.user.name, s.user.email))
    base = SubmissionRead.model_validate(s).model_dump()
    base["files"] = [
        SubmissionFileRead(id=f.id, filename=f"Archivo {i}{Path(f.filename).suffix.lower()}")
        for i, f in enumerate(upload_order(s.files), 1)
    ]
    base["student_comment"] = replace_with_label(s.student_comment, pattern) if s.student_comment else None
    return ReviewSubmissionRead(
        **base,
        pipeline_status=s.pipeline_status,
        pipeline_error=s.pipeline_error,
        difficulty=s.difficulty,
        difficulty_reason=s.difficulty_reason,
        ai_summary=s.ai_summary,
        assigned_ta_id=s.assigned_ta_id,
        assigned_ta_name=s.assigned_ta.name if s.assigned_ta else None,
        needs_anonymization_check=s.needs_anonymization_check,
    )


@router.patch("/{submission_id}/assignee", response_model=ReviewSubmissionRead)
async def update_assignee(submission_id: uuid.UUID, body: AssigneeUpdate, db: AsyncSession = Depends(get_db)):
    """Manually reassign a submission to another TA of the section (teachers only)."""
    submission = await _get_submission(db, submission_id)
    if not await is_assignment_teacher(db, body.user_id, submission.assignment_id):
        raise HTTPException(status_code=403, detail="Solo el profesor puede reasignar entregas")
    if body.ta_id is not None:
        assignment = await db.get(Assignment, submission.assignment_id)
        is_ta = await db.scalar(
            select(SectionMember.id).where(
                SectionMember.section_id == assignment.section_id,
                SectionMember.user_id == body.ta_id,
                SectionMember.role == Role.TA,
            )
        )
        if not is_ta:
            raise HTTPException(status_code=400, detail="Esa persona no es ayudante de la sección")
    submission.assigned_ta_id = body.ta_id
    await db.commit()
    return review_view(await load_for_review(db, submission_id))


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
        .options(selectinload(Assignment.submissions).options(*REVIEW_LOAD_OPTIONS))
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
                "status": a.status,
                "rubric": a.rubric,
                "open_date": a.open_date,
                "due_date": a.due_date,
                "filename": a.filename,
                "guideline_filename": a.guideline_filename,
                "pipeline_started_at": a.pipeline_started_at,
                "submissions": [review_view(sub) for sub in latest_per_user(a.submissions)],
            }
            for a in assignments
        ],
    }
