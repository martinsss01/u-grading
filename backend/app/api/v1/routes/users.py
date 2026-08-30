import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import get_db
from app.models.enums import Role
from app.models.section import SectionMember
from app.models.submission import Answer, Submission, SubmissionFile
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter()


@router.get("/", response_model=list[UserRead])
async def list_users(role: Role | None = None, search: str | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(User)
    if role is not None:
        stmt = stmt.where(User.role == role)
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

    if user.role == Role.ADMIN:
        count_result = await db.execute(select(func.count()).select_from(User).where(User.role == Role.ADMIN))
        if count_result.scalar_one() <= 1:
            raise HTTPException(status_code=400, detail="No se puede eliminar al último administrador")

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
