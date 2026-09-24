"""Turn every file of a submission into one merged PDF for in-app review.

Each file is converted on its own (PDF passthrough, images via img2pdf,
notebooks/code/text via HTML -> WeasyPrint, anything else -> a placeholder
page) and the parts are concatenated in upload order, so files added later
only append pages and never shift the ones TAs already annotated.
"""

import asyncio
import html
import io
import logging
import os
import re
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.submission import Submission, SubmissionDocument, SubmissionFile

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp"}
# Anything else is still rendered as text if it decodes as UTF-8; this list
# only covers files that might not (e.g. latin-1 sources from older editors).
TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".py", ".r", ".java",
    ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs",
    ".rb", ".php", ".sql", ".sh", ".m", ".jl", ".hs", ".kt", ".swift", ".scala", ".tex",
    ".html", ".css",
}
MAX_TEXT_BYTES = 2 * 1024 * 1024

BASE_CSS = """
@page { size: A4; margin: 1.6cm 1.4cm; }
body { font-family: "DejaVu Sans", sans-serif; font-size: 10pt; color: #222; }
.file-header { font-size: 9pt; color: #555; border-bottom: 1px solid #ccc;
               padding-bottom: 4px; margin-bottom: 10px; }
pre { font-family: "DejaVu Sans Mono", monospace; font-size: 8.5pt; line-height: 1.35;
      white-space: pre-wrap; word-break: break-all; margin: 0; }
img { max-width: 100%; }
table { border-collapse: collapse; font-size: 8.5pt; }
td, th { border: 1px solid #ddd; padding: 2px 6px; }
.placeholder { margin-top: 35%; text-align: center; color: #555; }
.placeholder h1 { font-size: 16pt; color: #222; word-break: break-all; }
/* notebook cells (nbconvert "basic" template) */
.jp-Cell, .cell { margin-bottom: 10px; }
.jp-InputArea, .input_area { background: #f6f6f6; border: 1px solid #e3e3e3; padding: 4px 6px; }
.jp-OutputArea-output pre, .output_area pre { background: none; }
.jp-InputPrompt, .jp-OutputPrompt, .prompt, .anchor-link { display: none; }
"""

# Serializes rebuilds of the same submission. A multi-page scan fires one
# upload per page in quick succession; each queues a rebuild, and the lock
# makes the last one (which reads the full file list) always finish last.
_locks: dict[uuid.UUID, asyncio.Lock] = {}


def _html_to_pdf(body: str, extra_css: str = "") -> bytes:
    from weasyprint import CSS, HTML  # lazy: needs system pango libs

    doc = f"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>{body}</body></html>"
    return HTML(string=doc).write_pdf(stylesheets=[CSS(string=BASE_CSS + extra_css)])


def _header(filename: str) -> str:
    return f"<div class='file-header'>{html.escape(filename)}</div>"


def _placeholder_pdf(filename: str, reason: str) -> bytes:
    return _html_to_pdf(
        f"<div class='placeholder'><h1>{html.escape(filename)}</h1>"
        f"<p>{html.escape(reason)}</p>"
        "<p>Descárgalo desde la lista de entregas para revisarlo.</p></div>"
    )


def _pdf_passthrough(path: Path) -> bytes:
    from pypdf import PdfReader

    data = path.read_bytes()
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("encrypted")
    _ = len(reader.pages)  # forces a parse so corrupt files fail here
    return data


def _image_to_pdf(path: Path) -> bytes:
    import img2pdf
    from PIL import Image

    a4 = (img2pdf.mm_to_pt(210), img2pdf.mm_to_pt(297))
    layout = img2pdf.get_layout_fun(a4, fit=img2pdf.FitMode.into, auto_orient=True)
    try:
        # JPEGs are embedded as-is, no re-encoding.
        return img2pdf.convert(str(path), layout_fun=layout, rotation=img2pdf.Rotation.ifvalid)
    except Exception:
        # Formats/modes img2pdf refuses (alpha PNG, webp, palette GIF...).
        with Image.open(path) as im:
            buf = io.BytesIO()
            im.convert("RGB").save(buf, format="PNG")
        return img2pdf.convert(buf.getvalue(), layout_fun=layout)


def _read_text(path: Path) -> str | None:
    if path.stat().st_size > MAX_TEXT_BYTES:
        return None
    raw = path.read_bytes()
    if b"\x00" in raw:
        return None  # binary
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        if path.suffix.lower() in TEXT_EXTENSIONS:
            return raw.decode("latin-1")
        return None


def _text_to_pdf(filename: str, text: str) -> bytes:
    from pygments import highlight
    from pygments.formatters import HtmlFormatter
    from pygments.lexers import TextLexer, guess_lexer_for_filename
    from pygments.util import ClassNotFound

    try:
        lexer = guess_lexer_for_filename(filename, text)
    except ClassNotFound:
        lexer = TextLexer()
    formatter = HtmlFormatter(linenos="inline", style="friendly")
    return _html_to_pdf(_header(filename) + highlight(text, lexer, formatter), formatter.get_style_defs(".highlight"))


def _notebook_to_pdf(filename: str, text: str) -> bytes:
    import nbformat
    from nbconvert import HTMLExporter
    from pygments.formatters import HtmlFormatter

    nb = nbformat.reads(text, as_version=4)
    body, _ = HTMLExporter(template_name="basic").from_notebook_node(nb)
    style = HtmlFormatter(style="friendly").get_style_defs(".highlight")
    return _html_to_pdf(_header(filename) + body, style)


def convert_file(path: Path, filename: str) -> bytes:
    """Convert one uploaded file to PDF bytes; never raises."""
    ext = Path(filename).suffix.lower()
    try:
        if not path.exists():
            return _placeholder_pdf(filename, "El archivo no se encontró en el servidor.")
        if ext == ".pdf":
            try:
                return _pdf_passthrough(path)
            except Exception:
                return _placeholder_pdf(filename, "El PDF está protegido o dañado y no se puede mostrar.")
        if ext in IMAGE_EXTENSIONS:
            return _image_to_pdf(path)
        text = _read_text(path)
        if text is not None:
            if ext == ".ipynb":
                return _notebook_to_pdf(filename, text)
            return _text_to_pdf(filename, text)
    except Exception:
        logger.exception("Failed to convert %s", path)
        return _placeholder_pdf(filename, "No se pudo convertir este archivo a PDF.")
    return _placeholder_pdf(filename, "Este tipo de archivo no se puede previsualizar.")


def _natural_key(name: str) -> list:
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def _upload_order(files: list[SubmissionFile]) -> list[SubmissionFile]:
    """Files have no timestamp column, so use their write time on disk.

    Uploads (including scanned pages) are sent one at a time, so write time
    is upload order; natural filename order only breaks exact ties.
    """

    def key(f: SubmissionFile):
        try:
            mtime = os.stat(f.file_path).st_mtime
        except OSError:
            mtime = float("inf")
        return (mtime, _natural_key(f.filename))

    return sorted(files, key=key)


def merge_files(files: list[tuple[Path, str]], dest: Path) -> int:
    """Convert and concatenate the given (path, filename) pairs into dest."""
    from pypdf import PdfWriter

    writer = PdfWriter()
    for path, filename in files:
        writer.append(io.BytesIO(convert_file(path, filename)))
    if not files:
        writer.append(io.BytesIO(_html_to_pdf("<div class='placeholder'><h1>Entrega vacía</h1></div>")))
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".pdf.tmp")
    with tmp.open("wb") as out:
        writer.write(out)
    os.replace(tmp, dest)  # atomic: the viewer never reads a half-written file
    return len(writer.pages)


def document_path(submission: Submission, upload_dir: str) -> Path:
    return Path(upload_dir) / str(submission.assignment_id) / str(submission.user_id) / f"{submission.id}.pdf"


async def build_submission_pdf(submission_id: uuid.UUID) -> None:
    """Background task: (re)build a submission's merged PDF and record the result."""
    from fastapi.concurrency import run_in_threadpool

    from app.core.config import settings

    lock = _locks.setdefault(submission_id, asyncio.Lock())
    async with lock, AsyncSessionLocal() as db:
        result = await db.execute(
            select(Submission).where(Submission.id == submission_id).options(selectinload(Submission.files))
        )
        submission = result.scalar_one_or_none()
        if submission is None:
            return
        doc = await db.get(SubmissionDocument, submission_id)
        if doc is None:
            doc = SubmissionDocument(submission_id=submission_id)
            db.add(doc)

        files = [(Path(f.file_path), f.filename) for f in _upload_order(submission.files)]
        dest = document_path(submission, settings.UPLOAD_DIR)
        try:
            doc.page_count = await run_in_threadpool(merge_files, files, dest)
            doc.pdf_path = str(dest)
            doc.status = "ready"
            doc.error = None
        except Exception as exc:
            logger.exception("Failed to build PDF for submission %s", submission_id)
            doc.status = "failed"
            doc.error = str(exc)[:500]
        await db.commit()
