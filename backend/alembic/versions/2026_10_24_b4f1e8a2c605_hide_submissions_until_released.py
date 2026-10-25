"""hide submissions from TAs until the pipeline releases them

assignments.released_at is set once every submission was processed and
distributed; until then TAs see none of them. submissions.manual_anonymization_done
marks a failed submission a teacher censored by hand.

Assignments the pipeline already finished (or that were closed before it
existed) are marked released so TAs keep seeing them.

Revision ID: b4f1e8a2c605
Revises: a7d3c9e41b20
Create Date: 2026-10-24 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b4f1e8a2c605'
down_revision: Union[str, Sequence[str], None] = 'a7d3c9e41b20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assignments', sa.Column('released_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        'submissions',
        sa.Column('manual_anonymization_done', sa.Boolean(), server_default='false', nullable=False),
    )
    op.execute(
        "UPDATE assignments a SET released_at = now() "
        "WHERE a.pipeline_started_at IS NOT NULL AND NOT EXISTS ("
        "  SELECT 1 FROM submissions s WHERE s.assignment_id = a.id "
        "  AND s.pipeline_status IN ('queued', 'processing'))"
    )


def downgrade() -> None:
    op.drop_column('submissions', 'manual_anonymization_done')
    op.drop_column('assignments', 'released_at')
