import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import Role, Semester, pg_enum

if TYPE_CHECKING:
    from app.models.assignment import Assignment
    from app.models.course import Course
    from app.models.user import User


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (
        # Section numbers are assigned per course+semester+year tuple, starting at 1
        # and always increasing (see routes/sections.py); this constraint is the
        # source of truth that prevents two sections from getting the same number
        # under concurrent creation.
        UniqueConstraint(
            "course_id", "semester", "year", "section_number",
            name="uq_sections_course_semester_year_number",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id"))
    semester: Mapped[Semester] = mapped_column(pg_enum(Semester, "semester"))
    year: Mapped[int] = mapped_column(Integer)
    section_number: Mapped[int] = mapped_column(Integer)

    course: Mapped["Course"] = relationship(back_populates="sections")
    members: Mapped[list["SectionMember"]] = relationship(back_populates="section")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="section")


class SectionMember(Base):
    __tablename__ = "section_members"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sections.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    role: Mapped[Role] = mapped_column(pg_enum(Role, "role"))

    section: Mapped["Section"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()
