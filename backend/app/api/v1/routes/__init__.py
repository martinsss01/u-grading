from fastapi import APIRouter

from .assignments import router as assignments_router
from .auth import router as auth_router
from .sections import router as sections_router
from .submissions import router as submissions_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(sections_router, prefix="/sections", tags=["sections"])
router.include_router(assignments_router, prefix="/assignments", tags=["assignments"])
router.include_router(submissions_router, prefix="/submissions", tags=["submissions"])
