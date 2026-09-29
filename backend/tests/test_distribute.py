import random
from collections import Counter

from app.services.pipeline.distribute import assign_one, snake_distribute


def totals(plan, items):
    diff = dict(items)
    out = Counter()
    for key, ta in plan.items():
        out[ta] += diff[key]
    return out


def test_users_example_gives_each_ta_one_of_each():
    items = [("a", 1), ("b", 1), ("c", 2), ("d", 2), ("e", 3), ("f", 3)]
    plan = snake_distribute(items, ["X", "Y"])
    diff = dict(items)
    for ta in ("X", "Y"):
        assert sorted(diff[k] for k, t in plan.items() if t == ta) == [1, 2, 3]


def test_counts_differ_by_at_most_one_and_totals_are_close():
    rng = random.Random(7)
    for n_tas in (2, 3, 5):
        for n in (1, 7, 23, 60):
            items = [(i, rng.randint(1, 100)) for i in range(n)]
            tas = [f"ta{i}" for i in range(n_tas)]
            plan = snake_distribute(items, tas)
            assert set(plan) == {i for i, _ in items}
            counts = Counter(plan.values())
            assert max(counts.values()) - min(counts.get(t, 0) for t in tas) <= 1
            t = totals(plan, items)
            # Never worse than one hardest submission apart.
            assert max(t.values()) - min(t.get(x, 0) for x in tas) <= max(d for _, d in items)


def test_swaps_improve_on_plain_snake():
    # Plain snake gives X={100,10,9} (119) and Y={50,40,1} (91); a swap should narrow it.
    items = [("a", 100), ("b", 50), ("c", 40), ("d", 10), ("e", 9), ("f", 1)]
    t = totals(snake_distribute(items, ["X", "Y"]), items)
    assert abs(t["X"] - t["Y"]) < 28


def test_deterministic_with_ties():
    items = [(k, 5) for k in "abcdef"]
    assert snake_distribute(items, ["X", "Y"]) == snake_distribute(list(reversed(items)), ["X", "Y"])


def test_no_tas_assigns_nothing():
    assert snake_distribute([("a", 1)], []) == {}


def test_assign_one_picks_lowest_load():
    assert assign_one(30, {"X": (100, 3), "Y": (80, 4), "Z": (80, 3)}) == "Z"
