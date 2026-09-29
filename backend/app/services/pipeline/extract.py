"""Pipeline step 1: get the text of every page, OCR-ing the ones that are images."""

import asyncio
import uuid
from pathlib import Path

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.submission import Submission, SubmissionDocument, SubmissionRedaction
from app.services.pipeline import pdf_tools
from app.services.pipeline.ocr import OcrResult, ocr_page

# A page with less text than this is a scan/photo (including scanned PDFs).
MIN_TEXT_CHARS = 20
# OCR calls in flight per submission.
OCR_CONCURRENCY = 4


async def extract_text(submission_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Submission).where(Submission.id == submission_id).options(selectinload(Submission.user))
        )
        submission = result.scalar_one()
        doc = await db.get(SubmissionDocument, submission_id)
        if doc is None or doc.status != "ready" or not doc.pdf_path:
            raise RuntimeError("El PDF de la entrega no está listo")
        pdf_path = Path(doc.pdf_path)
        student_name = submission.user.name

    texts = await run_in_threadpool(pdf_tools.page_texts, pdf_path)
    scanned = [i for i, text in enumerate(texts) if len(text.strip()) < MIN_TEXT_CHARS]

    semaphore = asyncio.Semaphore(OCR_CONCURRENCY)

    async def ocr(index: int) -> OcrResult:
        async with semaphore:
            png = await run_in_threadpool(pdf_tools.render_png, pdf_path, index)
            return await ocr_page(png, student_name)

    ocr_results = dict(zip(scanned, await asyncio.gather(*(ocr(i) for i in scanned))))

    pages = []
    for index, text in enumerate(texts):
        if index in ocr_results:
            r = ocr_results[index]
            pages.append({"page": index + 1, "text": r.text, "source": "ocr", "confidence": r.confidence})
        else:
            pages.append({"page": index + 1, "text": text, "source": "pdf", "confidence": None})

    async with AsyncSessionLocal() as db:
        doc = await db.get(SubmissionDocument, submission_id)
        doc.page_texts = pages
        # Re-running replaces earlier automatic boxes; boxes TAs drew are kept.
        await db.execute(
            delete(SubmissionRedaction).where(
                SubmissionRedaction.submission_id == submission_id, SubmissionRedaction.source == "auto"
            )
        )
        for index, r in ocr_results.items():
            if r.identity_regions:
                db.add(
                    SubmissionRedaction(
                        submission_id=submission_id,
                        page=index + 1,
                        rects=[region.model_dump() for region in r.identity_regions],
                        source="auto",
                    )
                )
        await db.commit()


def needs_anonymization_check(page_texts: list[dict], auto_redaction_pages: set[int]) -> bool:
    """Flag scans where the automatic anonymization may have missed something:
    an unreadable page, or a scanned submission where no name was found at all
    (exams almost always carry one)."""
    ocr_pages = [p for p in page_texts if p["source"] == "ocr"]
    if any(p["confidence"] == "low" for p in ocr_pages):
        return True
    return bool(ocr_pages) and not auto_redaction_pages
