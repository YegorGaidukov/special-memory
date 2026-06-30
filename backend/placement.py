"""Decide a fresh upload's world transform with no placement page.

Port of ``web/src/lib/upload/placement.ts``, plus the new S4 ``scatter_near_cluster``
mode for phone uploads (no GPS, no projector-camera pose -> drop near the existing
cluster of memories). EXIF GPS still wins for desktop drops with geotagged photos.
"""
from __future__ import annotations

import math
import random
from typing import Mapping, Optional, Sequence

from .geo import geo_to_transform


def _is_finite_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def placement_transform(
    *,
    geo: Optional[Mapping[str, float]] = None,
    camera_position: Optional[Sequence[float]] = None,
    camera_forward: Optional[Sequence[float]] = None,
    origin: Mapping[str, float],
    standoff: float,
) -> dict:
    """EXIF GPS wins (projected). Else ``standoff`` metres in front of the camera.
    Else the origin (curator can move it later in edit mode)."""
    if geo and _is_finite_number(geo.get("lat")) and _is_finite_number(geo.get("lon")):
        return geo_to_transform(geo, origin, 0, 1)

    if camera_position is not None and camera_forward is not None:
        px, py, pz = camera_position
        fx, fy, fz = camera_forward
        length = math.hypot(fx, fy, fz) or 1
        position = [
            px + (fx / length) * standoff,
            py + (fy / length) * standoff,
            pz + (fz / length) * standoff,
        ]
        return {"position": position, "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]}

    return {"position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]}


def scatter_near_cluster(
    positions: Sequence[Sequence[float]],
    rng: Optional[random.Random] = None,
    *,
    empty_radius: float = 40.0,
    min_radius: float = 15.0,
) -> list:
    """Pick a ground position (y=0) within the footprint of the existing memories.

    The S4 phone-upload placement: no GPS, no projector-camera pose -> drop the new
    memory near the cluster so the city stays dense where remembered. Centroid + the
    cluster's bounding spread define a disc; the point is sampled uniformly within it
    (``min_radius`` floors a tight/single-point cluster). An empty city scatters
    around the origin within ``empty_radius``. ``rng`` is injected for deterministic
    tests.
    """
    rng = rng or random.Random()
    pts = [
        (p[0], p[2])
        for p in positions
        if p is not None and len(p) >= 3 and math.isfinite(p[0]) and math.isfinite(p[2])
    ]
    if not pts:
        cx, cz, radius = 0.0, 0.0, empty_radius
    else:
        cx = sum(x for x, _ in pts) / len(pts)
        cz = sum(z for _, z in pts) / len(pts)
        spread = max(math.hypot(x - cx, z - cz) for x, z in pts)
        radius = max(spread, min_radius)

    angle = rng.uniform(0, 2 * math.pi)
    r = radius * math.sqrt(rng.random())  # sqrt -> uniform over the disc area
    return [cx + r * math.cos(angle), 0.0, cz + r * math.sin(angle)]
