"""Seed courses, sections, users and memberships from `seed_data.md`.

Only the markdown tables in that file are read; each one is recognised by its
header row. Passwords come from the SEED_PASSWORD env var (default "123").

Run with:
    docker compose exec backend python -m app.seed            # insert
    docker compose exec backend python -m app.seed --dry-run  # parse + summary only

Insert-only: run it against an empty database.
"""

import asyncio
import os
import re
import sys
from pathlib import Path

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.course import Course
from app.models.enums import Role, Semester
from app.models.section import Section, SectionMember
from app.models.user import User

_SEED_FILE = Path(__file__).parent / "seed_data.md"

# (code, year, semester, number), as written in the file: "CC3001/2026/Primavera/1"
SectionKey = tuple[str, int, Semester, int]


def _split_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _tables(text: str) -> list[tuple[list[str], list[list[str]]]]:
    """Every markdown table in `text` as (header, rows)."""
    tables, lines = [], text.splitlines()
    i = 0
    while i < len(lines):
        if lines[i].lstrip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s|:-]+\|\s*$", lines[i + 1]):
            header, rows = _split_row(lines[i]), []
            i += 2
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(_split_row(lines[i]))
                i += 1
            tables.append((header, rows))
        else:
            i += 1
    return tables


def _parse_section_ref(ref: str) -> SectionKey:
    try:
        code, year, semester, number = ref.split("/")
        return code, int(year), Semester(semester), int(number)
    except ValueError as exc:
        raise ValueError(f"Referencia de sección inválida: {ref!r}") from exc


def _parse_list(cell: str) -> list[str]:
    return [item.strip() for item in cell.split(",") if item.strip()]


def load_seed_data(text: str) -> dict:
    courses: list[dict] = []  # {code, name, sections: [SectionKey]}
    users: dict[str, dict] = {}  # email -> {name, email, role}
    groups: dict[str, list[str]] = {}
    memberships: dict[tuple[str, SectionKey], Role] = {}  # (email, section) -> role

    membership_rows: list[list[str]] = []
    for header, rows in _tables(text):
        first = header[0]
        if first == "Código":
            periods = []
            for col in header[2:]:
                year, semester = col.split(" ", 1)
                periods.append((int(year), Semester(semester)))
            for row in rows:
                code, name, *counts = row
                sections = [
                    (code, year, semester, n)
                    for (year, semester), count in zip(periods, counts)
                    for n in range(1, int(count) + 1)
                ]
                courses.append({"code": code, "name": name, "sections": sections})
        elif first == "Nombre":
            for name, email, role in rows:
                if email in users:
                    raise ValueError(f"Usuario duplicado: {email}")
                users[email] = {"name": name, "email": email, "role": Role(role)}
        elif first == "Grupo":
            for name, members in rows:
                groups[name] = _parse_list(members)
        elif first == "Usuarios":
            membership_rows.extend(rows)

    all_sections = {key for course in courses for key in course["sections"]}
    for group, members in groups.items():
        for email in members:
            if email not in users:
                raise ValueError(f"Grupo @{group}: usuario desconocido {email}")

    for users_cell, role_cell, sections_cell in membership_rows:
        role = Role(role_cell)
        emails: list[str] = []
        for item in _parse_list(users_cell):
            if item.startswith("@"):
                if item[1:] not in groups:
                    raise ValueError(f"Grupo desconocido: {item}")
                emails.extend(groups[item[1:]])
            elif item in users:
                emails.append(item)
            else:
                raise ValueError(f"Usuario desconocido: {item}")
        for ref in _parse_list(sections_cell):
            key = _parse_section_ref(ref)
            if key not in all_sections:
                raise ValueError(f"Sección inexistente (revisa la tabla de cursos): {ref}")
            for email in emails:
                existing = memberships.get((email, key))
                if existing is not None and existing != role:
                    raise ValueError(f"{email} tiene roles distintos en {ref}: {existing.value} y {role.value}")
                memberships[(email, key)] = role

    return {"courses": courses, "users": users, "groups": groups, "memberships": memberships}


def _print_summary(data: dict) -> None:
    n_sections = sum(len(c["sections"]) for c in data["courses"])
    print(f"Cursos: {len(data['courses'])} · Secciones: {n_sections}")
    by_role: dict[str, int] = {}
    for u in data["users"].values():
        by_role[u["role"].value] = by_role.get(u["role"].value, 0) + 1
    print(f"Usuarios: {len(data['users'])} {by_role}")
    print(f"Membresías: {len(data['memberships'])}")
    per_user: dict[str, list[str]] = {}
    for (email, (code, year, semester, n)), role in sorted(data["memberships"].items(), key=lambda kv: (kv[0][0], kv[0][1][1], kv[0][1][0])):
        per_user.setdefault(email, []).append(f"{code}/{year}/{semester.value}/{n} ({role.value})")
    for email, items in per_user.items():
        print(f"  {email}: {', '.join(items)}")


async def seed(data: dict) -> None:
    pw_hash = hash_password(os.environ.get("SEED_PASSWORD", "123"))

    async with AsyncSessionLocal() as db:
        users = {
            email: User(name=u["name"], email=email, role=u["role"], hashed_password=pw_hash)
            for email, u in data["users"].items()
        }
        db.add_all(users.values())

        sections: dict[SectionKey, Section] = {}
        for c in data["courses"]:
            course = Course(name=c["name"], code=c["code"])
            for key in c["sections"]:
                _, year, semester, number = key
                sections[key] = Section(course=course, year=year, semester=semester, section_number=number)
            db.add(course)

        for (email, key), role in data["memberships"].items():
            db.add(SectionMember(section=sections[key], user=users[email], role=role))

        await db.commit()


def main() -> None:
    data = load_seed_data(_SEED_FILE.read_text(encoding="utf-8"))
    _print_summary(data)
    if "--dry-run" in sys.argv:
        print("(dry run: no se escribió nada)")
        return
    asyncio.run(seed(data))
    print("Seed completado.")


if __name__ == "__main__":
    main()
