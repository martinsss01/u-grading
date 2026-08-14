import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Role


class UserRead(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: Role
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: Role


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    role: Role | None = None
