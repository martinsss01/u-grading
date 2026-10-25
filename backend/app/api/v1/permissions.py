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
from app.models.submission import Submission
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


async def section_staff_role(db: AsyncSession, user_id: uuid.UUID | None, section_id: uuid.UUID) -> Role | None:
    """ADMIN for admins; otherwise TEACHER or TA if the user is one in the section (teacher wins), else None."""
    if user_id is None:
        return None
    user = await db.get(User, user_id)
    if user is None:
        return None
    if user.role == Role.ADMIN:
        return Role.ADMIN
    roles = set(
        (
            await db.execute(
                select(SectionMember.role).where(
                    SectionMember.section_id == section_id,
                    SectionMember.user_id == user_id,
                    SectionMember.role.in_([Role.TEACHER, Role.TA]),
                )
            )
        ).scalars()
    )
    if Role.TEACHER in roles:
        return Role.TEACHER
    return Role.TA if Role.TA in roles else None


def visible_to_ta(assignment: Assignment, submission: Submission) -> bool:
    """TAs only see a submission once its assignment was released and it is anonymized
    (by the pipeline, or by a teacher after the pipeline failed)."""
    return assignment.released_at is not None and (
        submission.pipeline_status == "done" or submission.manual_anonymization_done
    )
