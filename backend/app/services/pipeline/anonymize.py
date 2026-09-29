"""Build the anonymized copy of a submission's merged PDF (what TAs see).

1. Re-merge the files with identity masked in text sources (code, text,
   notebooks), which keeps those pages as real, selectable text.
2. On every page, black out what's left: identity text found in the PDF text
   layer (uploaded PDFs), boxes the OCR located on scans, and boxes TAs drew.
   Only pages with something to hide are rasterized, so nothing stays hidden
   *under* a box.

Page numbers never shift: if masking changed the page count (possible with
proportional fonts in notebooks), the original merged PDF is used as the base.
"""

import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageDraw
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.submission import Submission, SubmissionDocument
from app.services.pdf_conversion import merge_files, upload_order
from app.services.pipeline import pdf_tools
from app.services.pipeline.identity import identity_regex, identity_terms

logger = logging.getLogger(__name__)

# Margins added around boxes, as page fractions: OCR boxes are approximate.
PAD_OCR = 0.012
PAD_TEXT = 0.002
BURN_DPI = 200


def _pad(rect: pdf_tools.Rect, pad: float) -> pdf_tools.Rect:
    x, y = max(rect["x"] - pad, 0.0), max(rect["y"] - pad, 0.0)
    return {
        "x": x,
        "y": y,
        "width": min(rect["x"] + rect["width"] + pad, 1.0) - x,
        "height": min(rect["y"] + rect["height"] + pad, 1.0) - y,
    }


def burn_boxes(src: Path, dest: Path, boxes: dict[int, list[pdf_tools.Rect]]) -> None:
    """Copy src to dest, rasterizing the pages in `boxes` (0-based) with those boxes blacked out."""
    import pypdfium2 as pdfium
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(src))
    writer = PdfWriter()
    pdf = pdfium.PdfDocument(str(src))
    try:
        for index, page in enumerate(reader.pages):
            rects = boxes.get(index)
            if not rects:
                writer.add_page(page)
                continue
            image = pdf[index].render(scale=BURN_DPI / 72).to_pil().convert("RGB")
            draw = ImageDraw.Draw(image)
            w, h = image.size
            for r in rects:
                draw.rectangle(
                    [r["x"] * w, r["y"] * h, (r["x"] + r["width"]) * w, (r["y"] + r["height"]) * h], fill="black"
                )
            buf = io.BytesIO()
            # resolution=BURN_DPI makes the new page exactly the original's size in points.
            image.save(buf, format="PDF", resolution=BURN_DPI)
            writer.append(io.BytesIO(buf.getvalue()))
    finally:
        pdf.close()
    tmp = dest.with_suffix(".pdf.tmp")
    with tmp.open("wb") as out:
        writer.write(out)
    os.replace(tmp, dest)


def _text_layer_boxes(pdf_path: Path, pattern: re.Pattern[str]) -> dict[int, list[pdf_tools.Rect]]:
    """Identity found in the PDF's text layer: match with the (accent/case-insensitive)
    regex, then locate each exact matched string on the page."""
    boxes: dict[int, list[pdf_tools.Rect]] = {}
    for index, text in enumerate(pdf_tools.page_texts(pdf_path)):
        matches = {m.group(0) for m in pattern.finditer(text)}
        if matches:
            found = pdf_tools.find_text(pdf_path, index, matches, whole_word=True)
            if found:
                boxes[index] = [_pad(r, PAD_TEXT) for r in found]
    return boxes


def anonymize_pdf(
    files: list[tuple[Path, str]],
    original_pdf: Path,
    dest: Path,
    pattern: re.Pattern[str],
    extra_boxes: dict[int, list[pdf_tools.Rect]],
) -> int:
    """Write the anonymized PDF to dest; returns how many pages had to be blacked out."""
    masked = dest.with_name(dest.stem + ".masked.pdf")
    try:
        merge_files(files, masked, redact=pattern)
        base = masked
        if pdf_tools.page_count(masked) != pdf_tools.page_count(original_pdf):
            logger.warning("Masked PDF changed page count for %s; burning boxes on the original", original_pdf)
            base = original_pdf

        boxes = _text_layer_boxes(base, pattern)
        for index, rects in extra_boxes.items():
            boxes.setdefault(index, []).extend(rects)
        burn_boxes(base, dest, boxes)
        return len(boxes)
    finally:
        masked.unlink(missing_ok=True)


def anonymized_path(original_pdf: Path) -> Path:
    return original_pdf.with_name(original_pdf.stem + ".anon.pdf")


async def build_anonymized_pdf(submission_id: uuid.UUID) -> int:
    """(Re)build the anonymized PDF from the files, the student's identity and stored redactions."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Submission)
            .where(Submission.id == submission_id)
            .options(selectinload(Submission.files), selectinload(Submission.user), selectinload(Submission.redactions))
        )
        submission = result.scalar_one()
        doc = await db.get(SubmissionDocument, submission_id)
        if doc is None or doc.status != "ready" or not doc.pdf_path:
            raise RuntimeError("El PDF de la entrega no está listo")

        pattern = identity_regex(identity_terms(submission.user.name, submission.user.email))
        extra: dict[int, list[pdf_tools.Rect]] = {}
        for redaction in submission.redactions:
            pad = PAD_OCR if redaction.source == "auto" else 0.0
            extra.setdefault(redaction.page - 1, []).extend(_pad(r, pad) for r in redaction.rects)
        files = [(Path(f.file_path), f.filename) for f in upload_order(submission.files)]
        original = Path(doc.pdf_path)

    dest = anonymized_path(original)
    burned = await run_in_threadpool(anonymize_pdf, files, original, dest, pattern, extra)

    async with AsyncSessionLocal() as db:
        doc = await db.get(SubmissionDocument, submission_id)
        doc.anonymized_pdf_path = str(dest)
        # Always bump: the path is the same on rebuilds, and the viewer busts its cache on this.
        doc.updated_at = datetime.now(timezone.utc)
        await db.commit()
    return burned
