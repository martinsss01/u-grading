"""Pipeline step 3: AI review of the anonymized submission.

Produces TA-only suggested comments anchored on the anonymized PDF, a short
summary, and a 1-100 score of how much effort grading it will take.
"""

import logging
import uuid
from pathlib import Path
from typing import Literal

from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment
from app.models.submission import Submission, SubmissionAnnotation, SubmissionDocument
from app.services.llm import complete_json, image_part, text_part
from app.services.pipeline import pdf_tools
from app.services.pipeline.identity import identity_regex, identity_terms, replace_with_label
from app.services.pipeline.ocr import Region

logger = logging.getLogger(__name__)

# Caps that keep one review's cost bounded; anything cut is flagged in the prompt.
MAX_REFERENCE_CHARS = 60_000
MAX_SUBMISSION_CHARS = 150_000
MAX_PAGE_IMAGES = 20

KIND_LABELS = {"error": "Error", "suggestion": "Sugerencia", "good": "Bien"}


class ReviewComment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: int = Field(description="1-based page number the comment is about")
    quote: str | None = Field(
        description="Exact text copied from that page's text, to highlight. Null for scanned pages or "
        "when the comment is about a drawing or the page as a whole"
    )
    region: Region | None = Field(
        description="For scanned pages: box around what the comment is about. Null otherwise"
    )
    kind: Literal["error", "suggestion", "good"]
    comment: str = Field(description="The comment for the TA, in Spanish, 1-3 sentences")


class Difficulty(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(description="1-100: how much effort grading this submission will take a TA")
    reasons: str = Field(description="One or two sentences in Spanish explaining the score")


class ReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(description="3-5 sentences in Spanish: what the student did, per question")
    comments: list[ReviewComment]
    difficulty: Difficulty


SYSTEM = """You assist teaching assistants (TAs) who grade university assignments. You review one \
anonymized student submission against the assignment statement and the private grading guideline, \
and prepare notes that help the TA grade faster and more consistently. The TA makes every grading \
decision; you never assign a grade.

Comments:
- Point out concrete errors, missing parts, and deviations from the guideline, and briefly note \
answers that are clearly correct so the TA can move on quickly.
- Be specific and verifiable: say what is wrong and what the guideline expects. Don't invent \
requirements the statement and guideline don't contain.
- Anchor each comment: for pages with a text layer, copy the exact passage into `quote` (short, \
verbatim, on a single line). For scanned pages, give a `region` box instead (fractions of the page, \
x/y = top-left corner). Use neither for page-level remarks.
- Prefer fewer, useful comments over many trivial ones (at most ~15).
- Write summary, comments and reasons in Spanish.

Difficulty: estimate the effort it will take a TA to grade this submission, not how good it is.
- 1-20: short and legible; answers clearly right, clearly wrong or blank; quick to check.
- 21-50: a typical submission with a few partial-credit decisions.
- 51-80: long, hard to read, or many partially correct answers that need careful checking.
- 81-100: very long, largely illegible, or unconventional approaches (e.g. code that must be run \
or reasoning that doesn't follow the expected method) with many judgement calls.

The submission is anonymized: [ESTUDIANTE] and black boxes replace the student's identity. Never \
try to guess who the student is."""


def _reference_text(path: str | None) -> str | None:
    if not path or not Path(path).exists():
        return None
    p = Path(path)
    if p.suffix.lower() == ".pdf":
        return "\n\n".join(pdf_tools.page_texts(p))
    try:
        return p.read_text(errors="replace")
    except OSError:
        return None


def _cap(text: str, limit: int, what: str) -> str:
    if len(text) <= limit:
        return text
    logger.warning("Truncating %s from %s to %s chars for review", what, len(text), limit)
    return text[:limit] + f"\n[... {what} truncado: {len(text) - limit} caracteres omitidos ...]"


def _anchor(pdf_path: Path, comment: ReviewComment, page_pins: dict[int, int]) -> tuple[dict, str | None]:
    """Position for the annotation: the quoted text if found, else the region, else a page-level pin."""
    index = comment.page - 1
    if comment.quote:
        for needle in (comment.quote.strip(), comment.quote.strip()[:40]):
            rects = pdf_tools.find_text(pdf_path, index, [needle]) if needle else []
            if rects:
                return {"kind": "text", "rects": rects}, comment.quote.strip()
    if comment.region:
        r = comment.region
        return {"kind": "area", "rects": [{"x": r.x, "y": r.y, "width": r.width, "height": r.height}]}, None
    n = page_pins.get(comment.page, 0)
    page_pins[comment.page] = n + 1
    return {"kind": "area", "rects": [{"x": 0.9, "y": 0.02 + 0.04 * n, "width": 0.06, "height": 0.03}]}, None


async def review_submission(submission_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Submission)
            .where(Submission.id == submission_id)
            .options(
                selectinload(Submission.user),
                selectinload(Submission.assignment).selectinload(Assignment.questions),
            )
        )
        submission = result.scalar_one()
        doc = await db.get(SubmissionDocument, submission_id)
        if doc is None or not doc.anonymized_pdf_path or doc.page_texts is None:
            raise RuntimeError("Faltan el texto o el PDF anonimizado de la entrega")
        assignment = submission.assignment
        pattern = identity_regex(identity_terms(submission.user.name, submission.user.email))
        anon_pdf = Path(doc.anonymized_pdf_path)
        page_texts = doc.page_texts
        student_comment = replace_with_label(submission.student_comment or "", pattern)
        questions = sorted(assignment.questions, key=lambda q: q.number)

    statement = await run_in_threadpool(_reference_text, assignment.file_path)
    guideline = await run_in_threadpool(_reference_text, assignment.guideline_path)

    header = [f"# Evaluación: {assignment.title} ({assignment.type.value})"]
    if assignment.rubric:
        header.append(f"## Descripción y criterios\n{assignment.rubric}")
    if questions:
        header.append(
            "## Preguntas\n" + "\n".join(f"- P{q.number} ({q.max_points} pts): {q.description}" for q in questions)
        )
    if statement:
        header.append("## Enunciado\n" + _cap(statement, MAX_REFERENCE_CHARS, "enunciado"))
    header.append(
        "## Pauta de corrección (privada)\n" + _cap(guideline, MAX_REFERENCE_CHARS, "pauta")
        if guideline
        else "## Pauta de corrección\n(No hay pauta: usa solo el enunciado y los criterios.)"
    )
    if student_comment:
        header.append(f"## Comentario del estudiante al entregar\n{student_comment}")

    # Page text (identity masked again in case a text layer or OCR slipped), plus images of scans.
    content = [text_part("\n\n".join(header) + "\n\n# Entrega del estudiante")]
    budget = MAX_SUBMISSION_CHARS
    images_left = MAX_PAGE_IMAGES
    for p in page_texts:
        text = replace_with_label(p["text"], pattern)
        if len(text) > budget:
            text = _cap(text, max(budget, 0), f"página {p['page']}")
        budget -= len(text)
        kind = "escaneada, transcrita por OCR" if p["source"] == "ocr" else "con texto"
        content.append(text_part(f"\n## Página {p['page']} ({kind})\n{text}"))
        if p["source"] == "ocr" and images_left > 0:
            png = await run_in_threadpool(pdf_tools.render_png, anon_pdf, p["page"] - 1, 110)
            content.append(image_part(png))
            images_left -= 1

    review = await complete_json(
        model=settings.LLM_REVIEW_MODEL, system=SYSTEM, content=content, output=ReviewResult, max_tokens=16000
    )

    page_count = len(page_texts)
    page_pins: dict[int, int] = {}
    annotations = []
    for c in review.comments:
        if not 1 <= c.page <= page_count:
            continue
        position, highlighted = await run_in_threadpool(_anchor, anon_pdf, c, page_pins)
        annotations.append(
            SubmissionAnnotation(
                submission_id=submission_id,
                author_id=None,
                source="ai",
                status="suggested",
                page=c.page,
                position=position,
                highlighted_text=highlighted,
                comment=f"{KIND_LABELS[c.kind]}: {c.comment}",
            )
        )

    async with AsyncSessionLocal() as db:
        # Re-running replaces pending suggestions; accepted/dismissed ones stay.
        await db.execute(
            delete(SubmissionAnnotation).where(
                SubmissionAnnotation.submission_id == submission_id,
                SubmissionAnnotation.source == "ai",
                SubmissionAnnotation.status == "suggested",
            )
        )
        db.add_all(annotations)
        submission = await db.get(Submission, submission_id)
        submission.ai_summary = review.summary
        submission.difficulty = min(max(review.difficulty.score, 1), 100)
        submission.difficulty_reason = review.difficulty.reasons
        await db.commit()
