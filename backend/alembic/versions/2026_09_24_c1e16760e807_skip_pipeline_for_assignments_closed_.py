"""skip pipeline for assignments closed before it existed

The worker starts the AI pipeline for every closed assignment whose
pipeline_started_at is null. Without this, the first deploy would send every
past assignment to the LLM. Past ones can still be run from the UI.

Revision ID: c1e16760e807
Revises: 973f811557bc
Create Date: 2026-09-24 22:15:00.177319

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c1e16760e807'
down_revision: Union[str, Sequence[str], None] = '973f811557bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE assignments SET pipeline_started_at = now() "
        "WHERE due_date <= now() AND pipeline_started_at IS NULL"
    )


def downgrade() -> None:
    # Data-only; there is no way to tell which rows this touched.
    pass
