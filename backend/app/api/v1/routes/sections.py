import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.enums import Role
from app.models.section import Section, SectionMember
from app.schemas.section import SectionRead

router = APIRouter()


@router.get("/", response_model=list[SectionRead])
async def list_sections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Section).options(selectinload(Section.course)))
    return result.scalars().all()


@router.get("/ta/{user_id}", response_model=list[SectionRead])
async def list_ta_sections(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Section)
        .join(Section.members)
        .where(SectionMember.user_id == user_id, SectionMember.role == Role.TA)
        .options(selectinload(Section.course))
    )
    return result.scalars().all()
