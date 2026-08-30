import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.enums import Role, Semester
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

# Retry budget for the rare race where two requests compute the same
# next section_number for the same course+semester+year tuple at once;
# the DB unique constraint rejects the loser, which just retries with a
# freshly computed number.
MAX_SECTION_NUMBER_ATTEMPTS = 5


async def _next_section_number(
    db: AsyncSession, course_id: uuid.UUID, semester: Semester, year: int
) -> int:
    result = await db.execute(
        select(func.max(Section.section_number)).where(
            Section.course_id == course_id,
            Section.semester == semester,
            Section.year == year,
        )
    )
    current_max = result.scalar_one_or_none()
    return (current_max or 0) + 1


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
    for attempt in range(MAX_SECTION_NUMBER_ATTEMPTS):
        section_number = await _next_section_number(db, payload.course_id, payload.semester, payload.year)
        section = Section(
            course_id=payload.course_id,
            semester=payload.semester,
            year=payload.year,
            section_number=section_number,
        )
        db.add(section)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            continue
        await db.refresh(section, attribute_names=["course"])
        return section
    raise HTTPException(
        status_code=409, detail="No se pudo asignar un número de sección, intenta nuevamente"
    )


@router.patch("/{section_id}", response_model=SectionRead)
async def update_section(section_id: uuid.UUID, payload: SectionUpdate, db: AsyncSession = Depends(get_db)):
    update_data = payload.model_dump(exclude_unset=True)

    for attempt in range(MAX_SECTION_NUMBER_ATTEMPTS):
        result = await db.execute(
            select(Section).where(Section.id == section_id).options(selectinload(Section.course))
        )
        section = result.scalar_one_or_none()
        if not section:
            raise HTTPException(status_code=404)

        new_course_id = update_data.get("course_id", section.course_id)
        new_semester = update_data.get("semester", section.semester)
        new_year = update_data.get("year", section.year)
        # course_id/semester/year identify the tuple a section_number is scoped
        # to, so moving a section into a different tuple means it needs a fresh
        # number there; the old tuple is left with a gap rather than renumbered.
        moved_tuple = (
            new_course_id != section.course_id
            or new_semester != section.semester
            or new_year != section.year
        )

        for field, value in update_data.items():
            setattr(section, field, value)
        if moved_tuple:
            section.section_number = await _next_section_number(db, new_course_id, new_semester, new_year)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            continue
        await db.refresh(section, attribute_names=["course"])
        return section

    raise HTTPException(
        status_code=409, detail="No se pudo asignar un número de sección, intenta nuevamente"
    )


@router.delete("/{section_id}", status_code=204)
async def delete_section(section_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Section)
        .where(Section.id == section_id)
        .options(
            selectinload(Section.members),
            selectinload(Section.assignments).selectinload(Assignment.questions),
            selectinload(Section.assignments).selectinload(Assignment.submissions).selectinload(Submission.answers),
            selectinload(Section.assignments).selectinload(Assignment.submissions).selectinload(Submission.files),
        )
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404)

    for assignment in section.assignments:
        for submission in assignment.submissions:
            for answer in submission.answers:
                await db.delete(answer)
            for sub_file in submission.files:
                await db.delete(sub_file)
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
