from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.grade import Grade
from app.schemas.grade import GradeCreate, GradeRead

router = APIRouter()


@router.get("/", response_model=list[GradeRead])
async def list_grades(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Grade))
    return result.scalars().all()


@router.post("/", response_model=GradeRead, status_code=201)
async def create_grade(payload: GradeCreate, db: AsyncSession = Depends(get_db)):
    grade = Grade(**payload.model_dump())
    db.add(grade)
    await db.commit()
    await db.refresh(grade)
    return grade


@router.get("/{grade_id}", response_model=GradeRead)
async def get_grade(grade_id: int, db: AsyncSession = Depends(get_db)):
    grade = await db.get(Grade, grade_id)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    return grade


@router.delete("/{grade_id}", status_code=204)
async def delete_grade(grade_id: int, db: AsyncSession = Depends(get_db)):
    grade = await db.get(Grade, grade_id)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    await db.delete(grade)
    await db.commit()
