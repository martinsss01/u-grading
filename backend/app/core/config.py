from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5433/ugrading"
    SECRET_KEY: str = "change-me"
    UPLOAD_DIR: str = "uploads"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
