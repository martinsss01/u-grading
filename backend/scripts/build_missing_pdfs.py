"""Build merged review PDFs for submissions that don't have one yet.

Run from backend/: python -m scripts.build_missing_pdfs [--all]
(--all rebuilds every submission, e.g. after changing the converter.)
"""

import asyncio
import sys

from sqlalchemy import select

import app.models  # noqa: F401  (registers models on Base.metadata)
from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
from app.models.submission import Submission, SubmissionDocument
from app.services.pdf_conversion import build_submission_pdf


async def main(rebuild_all: bool) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        stmt = select(Submission.id)
        if not rebuild_all:
            stmt = stmt.outerjoin(SubmissionDocument).where(SubmissionDocument.submission_id.is_(None))
        ids = (await db.execute(stmt)).scalars().all()
    for i, submission_id in enumerate(ids, 1):
        await build_submission_pdf(submission_id)
        print(f"[{i}/{len(ids)}] {submission_id}")


if __name__ == "__main__":
    asyncio.run(main("--all" in sys.argv))
