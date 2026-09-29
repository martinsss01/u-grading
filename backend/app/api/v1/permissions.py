"""Role checks shared by routes.

There's no real auth yet: callers pass the acting user's id, so these checks
only keep honest clients honest (see the plan's auth caveat).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.enums import Role
from app.models.section import SectionMember
from app.models.user import User


async def _has_section_role(
    db: AsyncSession, user_id: uuid.UUID | None, assignment_id: uuid.UUID, roles: list[Role]
) -> bool:
    """Admins always pass; otherwise the user needs one of `roles` in the assignment's section."""
    if user_id is None:
        return False
    user = await db.get(User, user_id)
    if user is None:
        return False
    if user.role == Role.ADMIN:
        return True
    membership = await db.execute(
        select(SectionMember.id)
        .join(Assignment, Assignment.section_id == SectionMember.section_id)
        .where(
            Assignment.id == assignment_id,
            SectionMember.user_id == user_id,
            SectionMember.role.in_(roles),
        )
    )
    return membership.first() is not None


async def can_review_assignment(db: AsyncSession, user_id: uuid.UUID | None, assignment_id: uuid.UUID) -> bool:
    """The section's TAs and teachers (TA status is per-section)."""
    return await _has_section_role(db, user_id, assignment_id, [Role.TA, Role.TEACHER])


async def is_assignment_teacher(db: AsyncSession, user_id: uuid.UUID | None, assignment_id: uuid.UUID) -> bool:
    return await _has_section_role(db, user_id, assignment_id, [Role.TEACHER])
