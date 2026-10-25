import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.db.session import get_db
from app.models.course import Course
from app.models.enums import Role
from app.models.section import Section, SectionMember
from app.models.submission import Answer, Submission, SubmissionFile
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserSectionRead, UserUpdate

router = APIRouter()


async def _ensure_not_last_admin(db: AsyncSession) -> None:
    """Raise if there is only one admin left, so the platform can't end up without one."""
    count = await db.scalar(select(func.count()).select_from(User).where(User.is_admin))
    if count <= 1:
        raise HTTPException(status_code=400, detail="No se puede quitar al último administrador")


@router.get("/{user_id}/sections", response_model=list[UserSectionRead])
async def list_user_sections(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Every section the user belongs to, with their role in each (newest first)."""
    if await db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    result = await db.execute(
        select(SectionMember)
        .join(Section, Section.id == SectionMember.section_id)
        .join(Course, Course.id == Section.course_id)
        .where(SectionMember.user_id == user_id)
        .options(selectinload(SectionMember.section).selectinload(Section.course))
        .order_by(Section.year.desc(), Section.semester, Course.code, Section.section_number)
    )
    return result.scalars().all()


@router.get("/", response_model=list[UserRead])
async def list_users(role: Role | None = None, search: str | None = None, db: AsyncSession = Depends(get_db)):
    """`role=Administrador` lists admins; any other role, users who have it in at least one section."""
    stmt = select(User)
    if role == Role.ADMIN:
        stmt = stmt.where(User.is_admin)
    elif role is not None:
        stmt = stmt.where(
            select(SectionMember.id)
            .where(SectionMember.user_id == User.id, SectionMember.role == role)
            .exists()
        )
    if search:
        stmt = stmt.where(User.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(User.name)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=UserRead, status_code=201)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_admin=payload.is_admin or payload.role == Role.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(user_id: uuid.UUID, payload: UserUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404)

    update_data = payload.model_dump(exclude_unset=True)
    password = update_data.pop("password", None)
    # Until the deprecated global role is dropped, changing it to or from Administrador sets is_admin.
    if "role" in update_data and "is_admin" not in update_data:
        update_data["is_admin"] = update_data["role"] == Role.ADMIN
    if update_data.get("is_admin") is False and user.is_admin:
        await _ensure_not_last_admin(db)

    if "email" in update_data and update_data["email"] != user.email:
        existing = await db.execute(select(User).where(User.email == update_data["email"]))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Email ya registrado")

    for field, value in update_data.items():
        setattr(user, field, value)
    if password:
        user.hashed_password = hash_password(password)

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404)

    if user.is_admin:
        await _ensure_not_last_admin(db)

    member_result = await db.execute(select(SectionMember).where(SectionMember.user_id == user_id))
    for member in member_result.scalars().all():
        await db.delete(member)

    submission_result = await db.execute(
        select(Submission).where(Submission.user_id == user_id)
    )
    for submission in submission_result.scalars().all():
        answer_result = await db.execute(select(Answer).where(Answer.submission_id == submission.id))
        for answer in answer_result.scalars().all():
            await db.delete(answer)
        file_result = await db.execute(select(SubmissionFile).where(SubmissionFile.submission_id == submission.id))
        for sub_file in file_result.scalars().all():
            await db.delete(sub_file)
        await db.delete(submission)

    graded_result = await db.execute(select(Answer).where(Answer.graded_by == user_id))
    for answer in graded_result.scalars().all():
        answer.graded_by = None
        answer.graded_at = None

    await db.flush()
    await db.delete(user)
    await db.commit()
