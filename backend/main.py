import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes import router as api_router
from app.core.config import settings
import app.models  # noqa: F401  (registers models on Base.metadata)
from app.services.pipeline.worker import run_worker

# Show the app's own INFO logs (pipeline progress) without touching uvicorn/SQLAlchemy logging.
_app_logger = logging.getLogger("app")
_app_logger.setLevel(logging.INFO)
_app_logger.addHandler(logging.StreamHandler())


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The schema is managed by Alembic (`alembic upgrade head`, run by the
    # docker-compose command before uvicorn starts).
    worker = asyncio.create_task(run_worker()) if settings.PIPELINE_WORKER_ENABLED else None
    yield
    if worker:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


app = FastAPI(title="U-Grading API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
