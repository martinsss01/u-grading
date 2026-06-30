"""One-off script to seed courses and sections for local development.

Courses are loaded from courses_seed.json in the same directory. Run with:

    docker compose exec backend python -m app.seed
"""

import asyncio
import json
from pathlib import Path

from app.db.session import AsyncSessionLocal
from app.models.course import Course
from app.models.enums import Semester
from app.models.section import Section

_SEED_FILE = Path(__file__).parent / "courses_seed.json"

_SEMESTER_MAP = {
    "Semester.SPRING": Semester.SPRING,
    "Semester.FALL": Semester.FALL,
}


def _load_courses() -> list[dict]:
    data = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
    for course in data:
        for section in course["sections"]:
            section["semester"] = _SEMESTER_MAP[section["semester"]]
    return data


async def seed() -> None:
    courses = _load_courses()
    async with AsyncSessionLocal() as db:
        for course_data in courses:
            course = Course(
                name=course_data["name"],
                code=course_data["code"],
                sections=[Section(**s) for s in course_data["sections"]],
            )
            db.add(course)
        await db.commit()
    print(f"Seeded {len(courses)} course(s).")


if __name__ == "__main__":
    asyncio.run(seed())
