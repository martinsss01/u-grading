"""assignment modality (Presencial / Remoto)

In-person assignments are entered as a start time plus a duration; remote
ones as a date range. Both still store open_date/due_date. Existing
assignments become Remoto, which is how they were entered.

Revision ID: a7d3c9e41b20
Revises: 5b8e2f1c9a47
Create Date: 2026-10-15 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a7d3c9e41b20'
down_revision: Union[str, Sequence[str], None] = '5b8e2f1c9a47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

modality = postgresql.ENUM('Presencial', 'Remoto', name='modality')


def upgrade() -> None:
    modality.create(op.get_bind(), checkfirst=True)
    op.add_column('assignments', sa.Column('modality', modality, server_default='Remoto', nullable=False))


def downgrade() -> None:
    op.drop_column('assignments', 'modality')
    modality.drop(op.get_bind(), checkfirst=True)
