"""reconcile legacy create_all schema

Databases created before Alembic (via Base.metadata.create_all on older
models) differ slightly from the baseline: users columns were nullable,
email was unique via a constraint instead of a unique index, and some ids
had no server default. Every statement here is idempotent, so on a fresh
database built from the baseline this migration is a no-op.

Revision ID: e06a72f62c70
Revises: 15432b7aaf28
Create Date: 2026-09-24 22:03:01.441686

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e06a72f62c70'
down_revision: Union[str, Sequence[str], None] = '15432b7aaf28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UUID_DEFAULT_TABLES = ("assignments", "courses", "questions", "section_members", "sections", "users")


def upgrade() -> None:
    for table in UUID_DEFAULT_TABLES:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    for column in ("email", "hashed_password", "role"):
        op.execute(f"ALTER TABLE users ALTER COLUMN {column} SET NOT NULL")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key")
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.execute("CREATE UNIQUE INDEX ix_users_email ON users (email)")


def downgrade() -> None:
    # Nothing to undo: the result matches the baseline schema.
    pass
