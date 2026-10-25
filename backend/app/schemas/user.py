import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import Role
from app.schemas.section import SectionRead


class UserRead(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    # Deprecated: roles only exist per section (see UserSectionRead); dropped once the frontend stops reading it.
    role: Role
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    # Deprecated, see UserRead.role. Administrador also makes the user an admin.
    role: Role = Role.STUDENT
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    role: Role | None = None
    is_admin: bool | None = None


class UserSectionRead(BaseModel):
    """One of the user's section memberships: the section and their role in it."""

    section: SectionRead
    role: Role

    model_config = {"from_attributes": True}
