"""Validate an untrusted transform payload from the 3D gizmo before storing.

Port of ``web/src/lib/transform/validate.ts``. Position a finite Vec3, quaternion a
finite Quat, scale a finite positive number (zero/negative would collapse or mirror
the splat). The gate for ``PATCH /api/memories/{id}/transform``.
"""
from __future__ import annotations

import math


def _is_finite_number_array(value, length: int) -> bool:
    return (
        isinstance(value, list)
        and len(value) == length
        and all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in value)
    )


def is_valid_transform(value) -> bool:
    if not isinstance(value, dict):
        return False
    scale = value.get("scale")
    return (
        _is_finite_number_array(value.get("position"), 3)
        and _is_finite_number_array(value.get("quaternion"), 4)
        and isinstance(scale, (int, float))
        and not isinstance(scale, bool)
        and math.isfinite(scale)
        and scale > 0
    )
