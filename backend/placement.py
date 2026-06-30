"""Decide a fresh upload's world transform with no placement page.

Port of ``web/src/lib/upload/placement.ts``, plus the new S4 ``scatter_near_cluster``
mode for phone uploads (no GPS, no projector-camera pose -> drop near the existing
cluster of memories). EXIF GPS still wins for desktop drops with geotagged photos.
"""
from __future__ import annotations

import math
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
