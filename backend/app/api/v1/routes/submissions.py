import io
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, Role
from app.models.section import Section, SectionMember
from app.models.submission import Submission, SubmissionAnnotation, SubmissionDocument, SubmissionFile
from app.models.user import User
from app.schemas.submission import (
    AnnotationCreate,
    AnnotationRead,
    AnnotationUpdate,
    ColabSubmissionCreate,
    SectionSubmissions,
    SubmissionDocumentRead,
    SubmissionRead,
)
from app.services.colab import ColabFetchError, fetch_colab_notebook
from app.services.pdf_conversion import build_submission_pdf

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
    db: AsyncSession = Depends(get_db),
):
    await _open_assignment(db, assignment_id)
    submission = await _existing_submission(db, submission_id, assignment_id, user_id)
    return await _save_file(db, background, submission, assignment_id, user_id, file.filename or "archivo", file.file)


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
        db, background, submission, body.assignment_id, body.user_id, filename, io.BytesIO(content)
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
    if doc is None or doc.pdf_path is None or not Path(doc.pdf_path).exists():
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    # Inline so browsers and the in-app viewer display it instead of downloading.
    return FileResponse(
        doc.pdf_path,
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
        author_name=a.author.name,
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


async def _can_review(db: AsyncSession, user_id: uuid.UUID, submission: Submission) -> bool:
    """Admins, or the TAs/teachers of the submission's section (TA status is per-section)."""
    user = await db.get(User, user_id)
    if user is None:
        return False
    if user.role == Role.ADMIN:
        return True
    membership = await db.execute(
        select(SectionMember.id)
        .join(Assignment, Assignment.section_id == SectionMember.section_id)
        .where(
            Assignment.id == submission.assignment_id,
            SectionMember.user_id == user_id,
            SectionMember.role.in_([Role.TA, Role.TEACHER]),
        )
    )
    return membership.first() is not None


@router.get("/{submission_id}/annotations", response_model=list[AnnotationRead])
async def list_annotations(submission_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SubmissionAnnotation)
        .where(SubmissionAnnotation.submission_id == submission_id)
        .options(selectinload(SubmissionAnnotation.author))
        .order_by(SubmissionAnnotation.page, SubmissionAnnotation.created_at)
    )
    return [_annotation_read(a) for a in result.scalars().all()]


@router.post("/{submission_id}/annotations", response_model=AnnotationRead, status_code=201)
async def create_annotation(submission_id: uuid.UUID, body: AnnotationCreate, db: AsyncSession = Depends(get_db)):
    submission = await db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if not await _can_review(db, body.author_id, submission):
        raise HTTPException(status_code=403, detail="Solo el equipo docente puede comentar")
    annotation = SubmissionAnnotation(submission_id=submission_id, **body.model_dump())
    db.add(annotation)
    await db.commit()
    return _annotation_read(await _load_annotation(db, annotation.id))


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
                "status": a.status,
                "rubric": a.rubric,
                "open_date": a.open_date,
                "due_date": a.due_date,
                "filename": a.filename,
                "submissions": _latest_per_user(a.submissions),
            }
            for a in assignments
        ],
    }
