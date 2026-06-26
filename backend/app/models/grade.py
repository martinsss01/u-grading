from sqlalchemy import String, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    subject: Mapped[str] = mapped_column(String(120))
    score: Mapped[float] = mapped_column(Float)
