from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.section import Section
from app.schemas.section import SectionRead

router = APIRouter()


@router.get("/", response_model=list[SectionRead])
async def list_sections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Section).options(selectinload(Section.course)))
    return result.scalars().all()
