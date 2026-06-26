"""One-off script to seed courses and sections for local development.

There's no UI for creating courses/sections yet, so edit the COURSES list
below with your real class data, then run:

    docker compose exec backend python -m app.seed
"""

import asyncio

from app.db.session import AsyncSessionLocal
from app.models.course import Course
from app.models.enums import Semester
from app.models.section import Section

COURSES = [
    {
        "name": "Introducción a la Programación",
        "code": "CC3001",
        "sections": [{"semester": Semester.FALL, "year": 2026}],
    },
    {
        "name": "Algoritmos y Estructuras de Datos",
        "code": "CC3002",
        "sections": [{"semester": Semester.SPRING, "year": 2026}],
    },
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        for course_data in COURSES:
            course = Course(
                name=course_data["name"],
                code=course_data["code"],
                sections=[Section(**s) for s in course_data["sections"]],
            )
            db.add(course)
        await db.commit()
    print(f"Seeded {len(COURSES)} course(s).")


if __name__ == "__main__":
    asyncio.run(seed())
