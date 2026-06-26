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
