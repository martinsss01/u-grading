# U-Grading

Full-stack grading management platform.

## Stack

| Layer     | Technology                                             |
|-----------|--------------------------------------------------------|
| Frontend  | Next.js 16 · React 19 · TypeScript · Tailwind CSS 3 · shadcn/Base UI |
| Backend   | FastAPI · SQLAlchemy (async) · Alembic                 |
| Database  | PostgreSQL 16                                          |
| LLMs      | OpenRouter (OCR + review models)                       |
| Pkg mgr   | npm (Node 20)                                          |

---

## Quick start — Docker (recommended)

```bash
docker-compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3001      |
| Backend  | http://localhost:8000      |
| API docs | http://localhost:8000/docs |
| Postgres | localhost:5433 (user `postgres`, db `ugrading`) |

---

## Local development (no Docker)

### 1 · Database
```bash
docker-compose up -d db   # only the Postgres container
```

### 2 · Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3 · Frontend
```bash
cd frontend
npm install
npm run dev     # → http://localhost:3000 (Docker serves it on 3001)
```

---

## Database migrations

The schema is managed with Alembic (`backend/alembic/`). The backend container
runs `alembic upgrade head` on every start, so pulling new code and restarting
is enough. After changing a model:

```bash
docker compose exec backend alembic revision --autogenerate -m "describe the change"
# review the generated file in backend/alembic/versions/, then:
docker compose exec backend alembic upgrade head
```

---

## AI-assisted grading pipeline

When an assignment closes, each student's latest submission goes through:

1. **Extract** – text of every page; pages without a text layer (phone scans,
   scanned PDFs) are transcribed by a vision LLM, which also locates the
   student's name.
2. **Anonymize** – the student's name, email and RUT are masked in code/text
   sources and blacked out on PDF pages and scans. TAs only ever see this copy
   (and neutral file names). The "Censurar" tool in the viewer fixes misses.
3. **Review** – an LLM reads the anonymized submission with the assignment
   statement and the private grading guideline (*pauta*), and leaves comment
   suggestions (visible only to TAs until one accepts them) plus a 1–100
   estimate of how hard the submission is to grade.
4. **Distribute** – submissions are split across the section's TAs so each gets
   the same number and a similar total difficulty.

Teachers can also start it manually or re-run it from *Evaluaciones → Correcciones*.

**Setup:** put an OpenRouter key in `backend/.env` (never commit it):

```bash
OPENROUTER_API_KEY=sk-or-...
# optional, OpenRouter model slugs:
LLM_OCR_MODEL=anthropic/claude-opus-5
LLM_REVIEW_MODEL=anthropic/claude-opus-5
```

Requests only go to providers that don't store prompts (`LLM_DATA_COLLECTION=deny`).
Without a key, submissions stay queued until one is configured.

**Choosing models:** `python -m scripts.eval_llm --model <slug>` measures OCR
character error rate and name detection on your own sample scans (see the
script's docstring; samples go in the gitignored `backend/eval_samples/`).

**Tests:** `docker compose exec backend sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q tests"`

---

## Project structure

```
u-grading/
├── docker-compose.yml
├── README.md
├── CLAUDE.md                     ← context + working rules for Claude Code
├── frontend/
│   ├── next.config.mjs
│   ├── tailwind.config.ts        ← brand palette tokens
│   └── src/
│       ├── app/
│       │   ├── page.tsx          ← login
│       │   ├── (admin)/          ← admin-users, admin-sections
│       │   ├── (student)/        ← student-assignments, -courses, -calendar
│       │   ├── assignments/      ← teacher assignment management
│       │   ├── submissions/      ← TA correction flow (section → assignment → submission)
│       │   └── scan/             ← phone scan upload page
│       ├── components/
│       │   ├── ui/               ← shadcn/Base UI primitives
│       │   ├── pdf-review/       ← PDF viewer with comments and redaction
│       │   └── role-guard.tsx    ← client-side role gate
│       └── lib/                  ← axios client (api.ts), scanApi.ts, helpers
└── backend/
    ├── main.py                   ← FastAPI entry point, starts the pipeline worker
    ├── alembic/versions/         ← migrations
    ├── scripts/                  ← eval_llm.py, build_missing_pdfs.py
    ├── tests/                    ← pytest
    └── app/
        ├── api/v1/routes/        ← auth, users, courses, sections, assignments, submissions
        ├── api/v1/permissions.py ← section-role checks
        ├── core/                 ← settings (config.py), security
        ├── db/                   ← engine, session, declarative base
        ├── models/               ← SQLAlchemy ORM models + Spanish-valued enums
        ├── schemas/              ← Pydantic request/response schemas
        ├── services/
        │   ├── llm.py            ← OpenRouter client
        │   ├── pdf_conversion.py ← merged review PDF
        │   └── pipeline/         ← extract, ocr, anonymize, review, distribute, worker
        └── seed.py               ← seed data (courses_seed.json, seed_data.md)
```
