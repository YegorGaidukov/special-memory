"""Geo math: lat/lon + heading -> the explorer's stored transform.

Port of ``web/src/lib/geo/{project,heading,transform}.ts``. The explorer (S2) does
no geo math; it reads these stored transforms verbatim. Equirectangular projection
about the city origin is accurate enough at city extent (the spec's chosen method).
"""
from __future__ import annotations

import math
from typing import Mapping

# Metres per degree of latitude (roughly constant on a sphere). Longitude metres
# scale by cos(latitude).
M_PER_DEG_LAT = 111_320.0

Vec3 = list  # [x, y, z]
Quat = list  # [x, y, z, w]


def project_to_local(geo: Mapping[str, float], origin: Mapping[str, float]) -> list[float]:
    """Project lat/lon to local world metres relative to the city origin.

    three.js frame: East = +X, North = -Z, ground plane y = 0.
    """
    m_per_deg_lon = M_PER_DEG_LAT * math.cos(math.radians(origin["lat"]))
    x = (geo["lon"] - origin["lon"]) * m_per_deg_lon
    z = -(geo["lat"] - origin["lat"]) * M_PER_DEG_LAT
    return [x + 0.0, 0.0, z + 0.0]  # + 0.0 normalises -0.0 -> 0.0


def heading_to_quaternion(heading_deg: float) -> list[float]:
    """Contributor facing-arrow heading (degrees) -> world orientation quaternion.

    Yaw about +Y: [0, sin(rad/2), 0, cos(rad/2)]. Sign convention locked to the seed
    manifest (heading 45 -> [0, 0.38268, 0, 0.92388]).
    """
    half = math.radians(heading_deg) / 2
    return [0.0, math.sin(half), 0.0, math.cos(half)]


def quaternion_to_heading_deg(q: list[float]) -> float:
    """Inverse of :func:`heading_to_quaternion`: extract yaw, normalised to [0, 360)."""
    x, y, z, w = q
    yaw = math.atan2(2 * (y * w + x * z), 1 - 2 * (y * y + z * z))
    deg = math.degrees(yaw)
    return ((deg % 360) + 360) % 360


def geo_to_transform(
    geo: Mapping[str, float],
    origin: Mapping[str, float],
    heading_deg: float,
    scale: float = 1.0,
) -> dict:
    """Turn lat/lon + heading (+ optional scale nudge) into the stored ``transform``."""
    return {
        "position": project_to_local(geo, origin),
        "quaternion": heading_to_quaternion(heading_deg),
        "scale": [scale, scale, scale],
    }
