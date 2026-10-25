"""drop users.role

Users have no role of their own: roles only exist per section
(section_members.role) and admins are marked with users.is_admin. The `role`
enum type stays, since section_members.role uses it.

Revision ID: e5b1f0a3c972
Revises: d2a7c4f9e318
Create Date: 2026-10-25 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e5b1f0a3c972'
down_revision: Union[str, Sequence[str], None] = 'd2a7c4f9e318'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

role = postgresql.ENUM('Administrador', 'Profesor', 'Ayudante', 'Estudiante', name='role', create_type=False)


def upgrade() -> None:
    op.drop_column('users', 'role')


def downgrade() -> None:
    # Best-effort rebuild: admins, then anyone who teaches a section, then everyone else as Estudiante.
    op.add_column('users', sa.Column('role', role, nullable=True))
    op.execute(
        "UPDATE users u SET role = CASE "
        "WHEN u.is_admin THEN 'Administrador'::role "
        "WHEN EXISTS (SELECT 1 FROM section_members sm WHERE sm.user_id = u.id AND sm.role = 'Profesor') "
        "THEN 'Profesor'::role "
        "ELSE 'Estudiante'::role END"
    )
    op.alter_column('users', 'role', nullable=False)
