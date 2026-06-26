import uuid
from datetime import date as date_
from typing import TYPE_CHECKING

from sqlalchemy import Date, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.section import Section


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String)
    code: Mapped[str] = mapped_column(String)
    created_at: Mapped[date_] = mapped_column(Date, server_default=func.current_date())

    sections: Mapped[list["Section"]] = relationship(back_populates="course")
