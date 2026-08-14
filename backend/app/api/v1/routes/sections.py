import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.enums import Role
from app.models.section import Section, SectionMember
from app.models.submission import Submission
from app.models.user import User
from app.schemas.section import (
    SectionCreate,
    SectionDetail,
    SectionMemberCreate,
    SectionMemberRead,
    SectionRead,
    SectionUpdate,
)

router = APIRouter()


@router.get("/", response_model=list[SectionRead])
async def list_sections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Section).options(selectinload(Section.course)))
    return result.scalars().all()


@router.get("/student/{user_id}", response_model=list[SectionRead])
async def list_student_sections(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Section)
        .join(Section.members)
        .where(SectionMember.user_id == user_id, SectionMember.role == Role.STUDENT)
        .options(selectinload(Section.course))
    )
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


@router.get("/teacher/{user_id}", response_model=list[SectionRead])
async def list_teacher_sections(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Section)
        .join(Section.members)
        .where(SectionMember.user_id == user_id, SectionMember.role == Role.TEACHER)
        .options(selectinload(Section.course))
    )
    return result.scalars().all()


@router.get("/{section_id}", response_model=SectionDetail)
async def get_section(section_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Section)
        .where(Section.id == section_id)
        .options(
            selectinload(Section.course),
            selectinload(Section.members).selectinload(SectionMember.user),
        )
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404)
    return section


@router.post("/", response_model=SectionRead, status_code=201)
async def create_section(payload: SectionCreate, db: AsyncSession = Depends(get_db)):
    section = Section(course_id=payload.course_id, semester=payload.semester, year=payload.year)
    db.add(section)
    await db.commit()
    await db.refresh(section, attribute_names=["course"])
    return section


@router.patch("/{section_id}", response_model=SectionRead)
async def update_section(section_id: uuid.UUID, payload: SectionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Section).where(Section.id == section_id).options(selectinload(Section.course))
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(section, field, value)

    await db.commit()
    await db.refresh(section, attribute_names=["course"])
    return section


@router.delete("/{section_id}", status_code=204)
async def delete_section(section_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Section)
        .where(Section.id == section_id)
        .options(
            selectinload(Section.members),
            selectinload(Section.assignments).selectinload(Assignment.questions),
            selectinload(Section.assignments).selectinload(Assignment.submissions).selectinload(Submission.answers),
        )
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404)

    for assignment in section.assignments:
        for submission in assignment.submissions:
            for answer in submission.answers:
                await db.delete(answer)
            await db.delete(submission)
        for question in assignment.questions:
            await db.delete(question)
        await db.delete(assignment)

    for member in section.members:
        await db.delete(member)

    await db.flush()
    await db.delete(section)
    await db.commit()


@router.post("/{section_id}/members", response_model=SectionMemberRead, status_code=201)
async def add_section_member(
    section_id: uuid.UUID, payload: SectionMemberCreate, db: AsyncSession = Depends(get_db)
):
    section_result = await db.execute(select(Section).where(Section.id == section_id))
    if section_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Sección no encontrada")

    user_result = await db.execute(select(User).where(User.id == payload.user_id))
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    existing_result = await db.execute(
        select(SectionMember).where(
            SectionMember.section_id == section_id,
            SectionMember.user_id == payload.user_id,
            SectionMember.role == payload.role,
        )
    )
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="El usuario ya tiene ese rol en la sección")

    member = SectionMember(section_id=section_id, user_id=payload.user_id, role=payload.role)
    db.add(member)
    await db.commit()
    await db.refresh(member, attribute_names=["user"])
    return member


@router.delete("/{section_id}/members/{member_id}", status_code=204)
async def remove_section_member(section_id: uuid.UUID, member_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SectionMember).where(SectionMember.id == member_id, SectionMember.section_id == section_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404)

    await db.delete(member)
    await db.commit()
