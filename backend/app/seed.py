"""One-off script to seed courses, sections, and dev users for local development.

Run with:
    docker compose exec backend python -m app.seed
"""

import asyncio
import json
from pathlib import Path

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.course import Course
from app.models.enums import Role, Semester
from app.models.section import Section, SectionMember
from app.models.user import User

_SEED_FILE = Path(__file__).parent / "courses_seed.json"

_SEMESTER_MAP = {
    "Semester.SPRING": Semester.SPRING,
    "Semester.FALL": Semester.FALL,
}

_USERS = [
    {"name": "Admin",     "email": "admin@ugrading.cl",     "role": Role.ADMIN},
    {"name": "Profesor",  "email": "profesor@ugrading.cl",  "role": Role.TEACHER},
    {"name": "Ayudante",  "email": "ayudante@ugrading.cl",  "role": Role.TA},
    {"name": "Estudiante","email": "estudiante@ugrading.cl","role": Role.STUDENT},
]


def _load_courses() -> list[dict]:
    data = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
    for course in data:
        for section in course["sections"]:
            section["semester"] = _SEMESTER_MAP[section["semester"]]
    return data


async def seed() -> None:
    pw_hash = hash_password("123")

    async with AsyncSessionLocal() as db:
        user_objects = {}
        for u in _USERS:
            user = User(name=u["name"], email=u["email"], role=u["role"], hashed_password=pw_hash)
            db.add(user)
            user_objects[u["email"]] = user

        courses = _load_courses()
        all_sections: list[Section] = []
        for course_data in courses:
            sections = [Section(**s) for s in course_data["sections"]]
            all_sections.extend(sections)
            course = Course(name=course_data["name"], code=course_data["code"], sections=sections)
            db.add(course)

        student = user_objects["estudiante@ugrading.cl"]
        for section in all_sections[:3]:
            db.add(SectionMember(section=section, user=student, role=Role.STUDENT))

        await db.commit()

    print(f"Seeded {len(_USERS)} user(s) and {len(courses)} course(s).")


if __name__ == "__main__":
    asyncio.run(seed())
