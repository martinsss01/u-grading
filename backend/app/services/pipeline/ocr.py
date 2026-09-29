"""OCR of one scanned page with a vision LLM, also locating the author's identity."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.services.llm import complete_json, image_part, text_part


class Region(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(description="Left edge, as a fraction (0-1) of the page width")
    y: float = Field(description="Top edge, as a fraction (0-1) of the page height")
    width: float = Field(description="Fraction (0-1) of the page width")
    height: float = Field(description="Fraction (0-1) of the page height")


class OcrResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(description="Full transcription of the page")
    identity_regions: list[Region] = Field(
        description="Boxes around the author's name, signature, student ID/RUT or email, wherever they appear"
    )
    confidence: Literal["high", "medium", "low"] = Field(
        description="How confident you are in the transcription overall"
    )


SYSTEM = """You transcribe scanned university assignments and exams (often handwritten, usually in Spanish) \
so teaching assistants can grade them.

Transcription rules:
- Transcribe everything the student wrote, in reading order, in the original language. Do not fix, \
complete, translate or summarize anything: mistakes must stay as written.
- Use Markdown for structure (headings for question numbers, lists where the student used them).
- Write math in LaTeX ($...$ inline, $$...$$ for display). Write code in fenced code blocks.
- Mark text you cannot read as [ilegible]. Describe drawings or diagrams briefly in [brackets].
- Include printed parts of the page (question statements, headers) only where they help locate answers.
- Never write the author's identity in the transcription: put [ESTUDIANTE] wherever their name, \
signature, student ID/RUT or email appears.

Identity rules:
- Return a tight box for every place where the author identifies themselves: their name, signature, \
student ID/RUT, or email. Include boxes for handwritten and printed occurrences.
- Coordinates are fractions of the page: x and y are the top-left corner, measured from the top-left \
of the image.
- Return an empty list if the page has none. Do not box names of other people, such as the professor \
or authors cited in the answer.

Confidence is "low" if large parts of the page are illegible or you are unsure about the identity boxes."""


async def ocr_page(png: bytes, student_name: str | None, *, model: str | None = None) -> OcrResult:
    hint = (
        f"The author of this page is registered as {student_name!r}; they may write it differently "
        "(initials, without accents, only first name and surname)."
        if student_name
        else "The author's name is unknown."
    )
    return await complete_json(
        model=model or settings.LLM_OCR_MODEL,
        system=SYSTEM,
        content=[image_part(png), text_part(f"Transcribe this page. {hint}")],
        output=OcrResult,
        max_tokens=8000,
    )
