"""users.is_admin

Roles only exist per section (section_members.role); being an admin is a
platform-level permission instead. Existing Administrador users become
admins. users.role is dropped in a later migration, once nothing reads it.

Revision ID: d2a7c4f9e318
Revises: b4f1e8a2c605
Create Date: 2026-10-25 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd2a7c4f9e318'
down_revision: Union[str, Sequence[str], None] = 'b4f1e8a2c605'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute("UPDATE users SET is_admin = true WHERE role = 'Administrador'")


def downgrade() -> None:
    op.drop_column('users', 'is_admin')
