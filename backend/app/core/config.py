from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5433/ugrading"
    SECRET_KEY: str = "change-me"
    UPLOAD_DIR: str = "uploads"
    # Comma-separated extra allowed origins, on top of the local dev frontend —
    # e.g. a cloudflared/ngrok tunnel URL so a phone can reach the API too.
    EXTRA_CORS_ORIGINS: str = ""

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def cors_origins(self) -> list[str]:
        extra = [o.strip() for o in self.EXTRA_CORS_ORIGINS.split(",") if o.strip()]
        return ["http://localhost:3001", *extra]


settings = Settings()
