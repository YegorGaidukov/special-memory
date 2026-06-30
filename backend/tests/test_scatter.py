import math
import random

from backend.placement import scatter_near_cluster


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


def test_empty_city_scatters_near_origin():
    p = scatter_near_cluster([], random.Random(0), empty_radius=40)
    assert p[1] == 0.0
    assert _dist(p, [0, 0, 0]) <= 40 + 1e-9


def test_lands_within_cluster_footprint():
    cluster = [[0, 0, 0], [30, 0, 0], [0, 0, 30], [30, 0, 30]]
    centroid = [15, 0, 15]
    rng = random.Random(7)
    for _ in range(200):
        p = scatter_near_cluster(cluster, rng)
        # spread = max dist from centroid = hypot(15,15) ~ 21.2; allow that radius.
        assert _dist(p, centroid) <= 21.3
        assert p[1] == 0.0


def test_deterministic_with_seed():
    a = scatter_near_cluster([[10, 0, 10]], random.Random(42))
    b = scatter_near_cluster([[10, 0, 10]], random.Random(42))
    assert a == b


def test_single_point_uses_min_radius():
    rng = random.Random(1)
    seen_far = False
    for _ in range(100):
        p = scatter_near_cluster([[5, 0, 5]], rng, min_radius=15)
        d = _dist(p, [5, 0, 5])
        assert d <= 15 + 1e-9
        if d > 1:
            seen_far = True
    assert seen_far  # not all stacked on the single point


def test_ignores_malformed_positions():
    p = scatter_near_cluster([None, [1, 2], [float("nan"), 0, 0], [10, 0, 10]], random.Random(0))
    # only the one valid point -> centroid (10,10), within min_radius
    assert _dist(p, [10, 0, 10]) <= 15 + 1e-9
