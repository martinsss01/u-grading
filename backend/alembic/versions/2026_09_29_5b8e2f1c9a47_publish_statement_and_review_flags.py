"""publish statement and review flags on assignments

The professor decides when students see an assignment ("Publicar enunciado")
and when they see their TA's review and grades ("Publicar corrección").
New assignments start hidden; existing ones were already visible to students,
so they're marked as published to keep them that way.

Revision ID: 5b8e2f1c9a47
Revises: c1e16760e807
Create Date: 2026-09-29 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '5b8e2f1c9a47'
down_revision: Union[str, Sequence[str], None] = 'c1e16760e807'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assignments', sa.Column('statement_published', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('assignments', sa.Column('review_published', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute("UPDATE assignments SET statement_published = true, review_published = true")


def downgrade() -> None:
    op.drop_column('assignments', 'review_published')
    op.drop_column('assignments', 'statement_published')
