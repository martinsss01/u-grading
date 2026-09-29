# U-Grading

Full-stack grading management platform.

## Stack

| Layer     | Technology                                             |
|-----------|--------------------------------------------------------|
| Frontend  | Next.js 14 · React 18 · TypeScript · Tailwind CSS     |
| Backend   | FastAPI · SQLAlchemy (async) · Alembic                 |
| Database  | PostgreSQL 16                                          |
| Pkg mgr   | npm (Node 20)                                          |

---

## Quick start — Docker (recommended)

```bash
docker-compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000      |
| Backend  | http://localhost:8000      |
| API docs | http://localhost:8000/docs |

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
npm run dev
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
U-Grading/
├── docker-compose.yml
├── README.md
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.mjs       ← proxies /api/* → backend
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── globals.css
│       ├── components/       ← shared React components (add here)
│       └── lib/
│           └── api.ts        ← pre-configured axios client
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── main.py               ← FastAPI entry point
    └── app/
        ├── api/v1/routes/    ← route handlers
        │   └── grades.py
        ├── core/config.py    ← settings via pydantic-settings
        ├── db/               ← engine, session, declarative base
        ├── models/grade.py   ← SQLAlchemy ORM models
        └── schemas/grade.py  ← Pydantic request/response schemas
```
