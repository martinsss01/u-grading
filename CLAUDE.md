# U-Grading

Grading management platform for students of **Universidad de Chile**. Students
upload submissions (PDFs, phone scans, code); an AI pipeline anonymizes and
pre-reviews them; TAs (ayudantes) correct them in an in-app PDF viewer;
teachers manage assignments; admins manage users, courses and sections.

## Working rules (always follow)

1. **Step-by-step implementation with approval.** For every implementation,
   first propose a numbered plan of small steps. Then do **one step at a
   time**: implement it, show what changed and how to check it, and **wait for
   the user's approval before starting the next step**. Do not batch steps.
2. **Never commit** (or push, amend, rebase) unless the user explicitly says
   so in that moment. Approving a step is not permission to commit.
   Commit style when asked: `feat: …` / `fix: …`, short, lowercase.
3. **All UI text is in Spanish** (Chilean university context: "Ayudante",
   "Evaluaciones", "Correcciones", "Sección", "Otoño/Primavera"). Code,
   identifiers and comments stay in English.
4. **Testing strategy is not defined yet.** Don't add test suites or
   frameworks on your own; existing backend pytest tests may be run. Ask if
   a change seems to need tests.
5. Never commit `.env` or secrets (`OPENROUTER_API_KEY` lives in `backend/.env`).

## Stack

- **Frontend:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 3 ·
  shadcn/Base UI components (`src/components/ui/`) · lucide-react · react-pdf · axios.
- **Backend:** FastAPI · async SQLAlchemy 2 (`Mapped`/`mapped_column`) ·
  asyncpg · Alembic · pydantic-settings.
- **DB:** PostgreSQL 16. **LLMs:** via OpenRouter (`app/services/llm.py`).

## Commands (run from repo root)

```bash
docker compose up --build -d          # db + backend + frontend
docker compose logs backend --tail 50
docker compose restart backend
# Migrations (backend runs `alembic upgrade head` on start)
docker compose exec backend alembic revision --autogenerate -m "describe change"
docker compose exec backend alembic upgrade head
# Seed (insert-only — running twice duplicates data)
docker compose exec backend python -m app.seed
# Backend tests
docker compose exec backend sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q tests"
# Frontend lint
cd frontend && npm run lint
```

Ports: frontend **http://localhost:3001** (docker), backend http://localhost:8000
(`/docs` Swagger, `/health`), Postgres on host port **5433**.

## Architecture

### Backend (`backend/`)
- `main.py` — app, CORS, mounts `/api/v1`, starts the pipeline worker on lifespan.
- `app/api/v1/routes/` — `auth`, `users`, `courses`, `sections`, `assignments`, `submissions`.
- `app/api/v1/permissions.py` — section-role checks. **No real auth yet:** the
  client sends the acting user's id; admins (`User.is_admin`) pass every check.
- **Roles only exist per section** (`SectionMember.role`: Profesor/Ayudante/Estudiante);
  a user has no role of their own. Admin is a platform permission (`User.is_admin`),
  never a section role. `GET /users/{id}/sections` lists a user's sections with their role.
- `app/models/` — `User`, `Course`, `Section`/`SectionMember`, `Assignment`/`Question`,
  `Submission`, `SubmissionFile`, `Answer`, `SubmissionDocument`,
  `SubmissionAnnotation`, `SubmissionRedaction`.
- `app/models/enums.py` — enum **values are Spanish** and stored as native PG enums
  (`Role`: Profesor/Ayudante/Estudiante for section members — the PG enum still has a legacy
  `Administrador` value that's rejected as a section role; `Semester`: Otoño/Primavera/Verano;
  `AssignmentType`: Tarea/Ejercicio/Control/Examen). `AssignmentStatus`
  (Pendiente/Abierto/Cerrado) is computed from dates, never stored.
- `app/services/pipeline/` — AI grading pipeline run by `worker.py`/`runner.py`:
  `extract` (+ `ocr` vision LLM for scans) → `anonymize` (+ `identity`, mask name/email/RUT)
  → `review` (LLM comment suggestions + 1–100 difficulty vs. the *pauta*) →
  `distribute` (balance submissions across the section's TAs).
- `app/services/pdf_conversion.py` — merges submission files into one review PDF.
- `app/seed.py` + `courses_seed.json` / `seed_data.md` — seed data.
- `scripts/eval_llm.py` — OCR/name-detection eval for choosing models.

### Frontend (`frontend/src/`)
- `app/(admin)/` — admin-users, admin-sections.
- `app/(student)/` — student-assignments, student-courses, student-calendar.
- `app/assignments/` — teacher assignment management.
- `app/submissions/[sectionId]/[assignmentId]/[submissionId]` — TA correction flow.
- `app/scan/[assignmentId]` — phone scan upload page (uses `lib/scanApi.ts`).
- `components/pdf-review/` — PDF viewer with annotations / redaction ("Censurar").
- `components/role-guard.tsx` — client-side gates: `RoleGuard` (has the role in some
  section) and `AdminGuard` (`is_admin`); logged-in user is in `localStorage["user"]`
  (`lib/user.ts`); forbidden users get a 404.
- `app/home/` — area picker for users with several areas (e.g. admin + Profesor);
  Ayudante and Estudiante count as one area, so TAs skip it (`startPage` in `lib/user.ts`).
- `lib/api.ts` — axios client (`NEXT_PUBLIC_API_URL`).

## Domain glossary

- **Ayudante** = TA. **Profesor** = teacher. **Sección** = a course offering in a
  given year/semester (`CODIGO/AÑO/SEMESTRE/NÚMERO`, e.g. `CC3001/2026/Primavera/1`).
- **Pauta** = private grading guideline (`Assignment.guideline_path`).
- **Enunciado** = assignment statement (`statement_published` controls visibility).
- **RUT** = Chilean national ID; must be anonymized for graders.
- TAs only ever see anonymized submissions; `Submission.user_id` is hidden at the API layer.

## Conventions

- Brand palette: named Tailwind tokens (`text-red`, `bg-darkergrey`, `bg-whiteish`, …)
  for fixed colors; semantic tokens (`text-primary`, `bg-background`) when it
  should follow light/dark. Main accent is red `#B5091D`.
- Seed users: `estudiante1`, `ayudante1`, `profesor1`, … (not "uno/dos").
- Schema changes always go through an Alembic migration (review the autogenerated file).
- Note: `README.md`'s "Project structure" section is outdated; trust this file.
