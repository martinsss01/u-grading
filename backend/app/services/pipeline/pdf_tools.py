"""Page-level PDF helpers on pypdfium2: render, extract text, find text boxes.

Boxes use the same format as annotations: fractions (0-1) of the page, origin top-left.
"""

import io
from collections.abc import Iterable
from pathlib import Path

import pypdfium2 as pdfium

Rect = dict[str, float]  # {"x", "y", "width", "height"}


def page_count(pdf_path: Path) -> int:
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        return len(pdf)
    finally:
        pdf.close()


def page_texts(pdf_path: Path) -> list[str]:
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        return [page.get_textpage().get_text_range() for page in pdf]
    finally:
        pdf.close()


def render_png(pdf_path: Path, page_index: int, dpi: int = 150) -> bytes:
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        image = pdf[page_index].render(scale=dpi / 72).to_pil()
        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="PNG")
        return buf.getvalue()
    finally:
        pdf.close()


def find_text(pdf_path: Path, page_index: int, needles: Iterable[str], whole_word: bool = False) -> list[Rect]:
    """Boxes of every (case-insensitive) occurrence of each needle on one page."""
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        page = pdf[page_index]
        width, height = page.get_size()
        textpage = page.get_textpage()
        rects: list[Rect] = []
        for needle in needles:
            if not needle.strip():
                continue
            searcher = textpage.search(needle, match_case=False, match_whole_word=whole_word)
            while (match := searcher.get_next()) is not None:
                start, count = match
                for i in range(textpage.count_rects(start, count)):
                    left, bottom, right, top = textpage.get_rect(i)
                    rects.append(
                        {
                            "x": left / width,
                            "y": (height - top) / height,
                            "width": (right - left) / width,
                            "height": (top - bottom) / height,
                        }
                    )
        return rects
    finally:
        pdf.close()
