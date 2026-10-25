import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Role
from app.schemas.section import SectionRead


class UserRead(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    # Platform-level permission; roles only exist per section (see UserSectionRead).
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    is_admin: bool | None = None


class UserSectionRead(BaseModel):
    """One of the user's section memberships: the section and their role in it."""

    section: SectionRead
    role: Role

    model_config = {"from_attributes": True}
