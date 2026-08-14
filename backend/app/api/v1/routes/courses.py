from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.course import Course
from app.schemas.section import CourseRead

router = APIRouter()


@router.get("/", response_model=list[CourseRead])
async def list_courses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Course).order_by(Course.name))
    return result.scalars().all()
