from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5433/ugrading"
    SECRET_KEY: str = "change-me"
    UPLOAD_DIR: str = "uploads"
    # Comma-separated extra allowed origins, on top of the local dev frontend —
    # e.g. a cloudflared/ngrok tunnel URL so a phone can reach the API too.
    EXTRA_CORS_ORIGINS: str = ""

    # AI pipeline via OpenRouter. The key lives only in backend/.env (gitignored).
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    # OpenRouter model slugs; swap them to compare models (see scripts/eval_llm.py).
    LLM_OCR_MODEL: str = "anthropic/claude-opus-5"
    LLM_REVIEW_MODEL: str = "anthropic/claude-opus-5"
    # "deny" routes only to providers that don't store/train on prompts.
    LLM_DATA_COLLECTION: str = "deny"
    LLM_TIMEOUT_SECONDS: float = 300
    # Background worker that starts the pipeline when assignments close.
    PIPELINE_WORKER_ENABLED: bool = True

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def cors_origins(self) -> list[str]:
        extra = [o.strip() for o in self.EXTRA_CORS_ORIGINS.split(",") if o.strip()]
        return ["http://localhost:3001", *extra]


settings = Settings()
