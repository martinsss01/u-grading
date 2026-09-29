"""Pipeline step 4: split an assignment's submissions across the section's TAs.

Goal: every TA gets the same number of submissions (at most one apart) and
as close as possible the same total difficulty.
"""

import statistics
import uuid
from collections.abc import Hashable, Sequence
from typing import TypeVar

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment
from app.models.enums import Role
from app.models.section import SectionMember
from app.models.submission import Submission

K = TypeVar("K", bound=Hashable)
T = TypeVar("T", bound=Hashable)


def snake_distribute(items: Sequence[tuple[K, int]], tas: Sequence[T]) -> dict[K, T]:
    """Assign (item, difficulty) pairs to TAs.

    Hardest first, dealt snake-style (A B B A A B ...) so counts differ by at
    most one and totals start close; then swap pairs between the heaviest and
    lightest TA while that narrows the gap (swaps keep counts unchanged).

    >>> sorted(snake_distribute([("a",3),("b",3),("c",2),("d",2),("e",1),("f",1)], ["X","Y"]).items())
    [('a', 'X'), ('b', 'Y'), ('c', 'Y'), ('d', 'X'), ('e', 'X'), ('f', 'Y')]
    """
    if not tas:
        return {}
    ordered = sorted(items, key=lambda item: (-item[1], str(item[0])))
    buckets: dict[T, list[tuple[K, int]]] = {ta: [] for ta in tas}
    n = len(tas)
    for i, item in enumerate(ordered):
        round_, pos = divmod(i, n)
        buckets[tas[pos if round_ % 2 == 0 else n - 1 - pos]].append(item)

    def total(ta: T) -> int:
        return sum(d for _, d in buckets[ta])

    for _ in range(len(ordered) ** 2):  # each swap strictly narrows the gap; this is only a safety cap
        heavy = max(tas, key=total)
        light = min(tas, key=total)
        gap = total(heavy) - total(light)
        best = None
        for hi, (_, dh) in enumerate(buckets[heavy]):
            for li, (_, dl) in enumerate(buckets[light]):
                delta = dh - dl
                if 0 < delta and abs(gap - 2 * delta) < gap and (best is None or abs(gap - 2 * delta) < best[0]):
                    best = (abs(gap - 2 * delta), hi, li)
        if best is None:
            break
        _, hi, li = best
        buckets[heavy][hi], buckets[light][li] = buckets[light][li], buckets[heavy][hi]

    return {key: ta for ta, bucket in buckets.items() for key, _ in bucket}


def assign_one(difficulty: int, loads: dict[T, tuple[int, int]]) -> T:
    """For a late addition: the TA with the lowest total difficulty (then fewest submissions)."""
    return min(loads, key=lambda ta: (loads[ta][0], loads[ta][1], str(ta)))


async def distribute_assignment(assignment_id: uuid.UUID) -> int:
    """Assign every processed, unassigned submission of the assignment. Returns how many were assigned.

    The first time, the whole set is dealt at once; afterwards (retries, manual
    re-runs) each new one goes to the least-loaded TA so earlier work isn't reshuffled.
    Failed submissions count with the median difficulty so they're still shared out.
    """
    async with AsyncSessionLocal() as db:
        assignment = await db.get(Assignment, assignment_id)
        tas = (
            await db.execute(
                select(SectionMember.user_id)
                .where(SectionMember.section_id == assignment.section_id, SectionMember.role == Role.TA)
                .order_by(SectionMember.user_id)
            )
        ).scalars().all()
        if not tas:
            return 0
        submissions = (
            await db.execute(
                select(Submission).where(
                    Submission.assignment_id == assignment_id,
                    Submission.pipeline_status.in_(["done", "failed"]),
                )
            )
        ).scalars().all()

        known = [s.difficulty for s in submissions if s.difficulty is not None]
        median = int(statistics.median(known)) if known else 50

        def difficulty(s: Submission) -> int:
            return s.difficulty if s.difficulty is not None else median

        unassigned = [s for s in submissions if s.assigned_ta_id is None]
        assigned = [s for s in submissions if s.assigned_ta_id in tas]
        if not unassigned:
            return 0

        if not assigned:
            plan = snake_distribute([(s.id, difficulty(s)) for s in unassigned], list(tas))
            for s in unassigned:
                s.assigned_ta_id = plan[s.id]
        else:
            loads = {ta: (0, 0) for ta in tas}
            for s in assigned:
                total, count = loads[s.assigned_ta_id]
                loads[s.assigned_ta_id] = (total + difficulty(s), count + 1)
            for s in sorted(unassigned, key=lambda s: -difficulty(s)):
                ta = assign_one(difficulty(s), loads)
                s.assigned_ta_id = ta
                total, count = loads[ta]
                loads[ta] = (total + difficulty(s), count + 1)
        await db.commit()
        return len(unassigned)
