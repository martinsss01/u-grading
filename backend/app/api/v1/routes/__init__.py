from fastapi import APIRouter
from .grades import router as grades_router

router = APIRouter()
router.include_router(grades_router, prefix="/grades", tags=["grades"])
