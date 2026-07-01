"""Extract placement (GPS + capture time) from a photo's EXIF.

The pure normaliser :func:`extract_placement` ports ``web/src/lib/exif/placement.ts``;
:func:`parse_placement` is the binary seam (Pillow) replacing the former exifr call in
``web/src/server/exif.ts``. GPS is optional — messaging-app exports strip it, so absence
is normal, not an error.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional


def _is_finite_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _to_iso_z(dt: datetime) -> str:
    """Format like JS ``Date.toISOString()``: UTC, milliseconds, trailing ``Z``."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def validate_captured_at(value) -> Optional[str]:
    """Normalise a manually-entered capture date to an ISO-Z string, or None.

    Accepts a ``<input type="date">`` value (``YYYY-MM-DD`` -> midnight UTC) or a full
    ISO 8601 datetime. Rejects empty/garbage. EXIF wins when present; this is the
    fallback the phone supplies.
    """
    if not isinstance(value, str) or not value.strip():
        return None
    s = value.strip()
    try:
        if len(s) == 10:  # YYYY-MM-DD
            dt = datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _to_iso_z(dt)


def resolve_captured_at(exif_value: Optional[str], manual_raw) -> Optional[str]:
    """Pick the record's capture time: the submitted date wins, EXIF is the fallback.

    The phone prefills its date field from EXIF and lets the user edit, so a submitted
    value is an explicit choice. Flows without a date field (desktop drag-drop) send
    nothing and keep the EXIF value.
    """
    return validate_captured_at(manual_raw) or (
        exif_value if isinstance(exif_value, str) else None
    )


def extract_placement(raw) -> dict:
    """Normalise a parsed-EXIF mapping into ``{geo?, captured_at?}``.

    Expects decimal ``latitude``/``longitude`` and a ``DateTimeOriginal`` datetime
    (as :func:`parse_placement` yields). Tolerant of ``None``/garbage input.
    """
    if not isinstance(raw, dict):
        return {}
    placement: dict = {}

    lat, lon = raw.get("latitude"), raw.get("longitude")
    if _is_finite_number(lat) and _is_finite_number(lon):
        placement["geo"] = {"lat": lat, "lon": lon}

    when = raw.get("DateTimeOriginal")
    if isinstance(when, datetime):
        placement["captured_at"] = _to_iso_z(when)

    return placement


# --- binary seam (Pillow) -------------------------------------------------------

_GPS_TAGS = {1: "GPSLatitudeRef", 2: "GPSLatitude", 3: "GPSLongitudeRef", 4: "GPSLongitude"}


def _dms_to_decimal(dms, ref) -> float | None:
    try:
        deg, minutes, seconds = (float(x) for x in dms)
    except (TypeError, ValueError):
        return None
    val = deg + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        val = -val
    return val


def parse_placement(image_bytes: bytes) -> dict:
    """Run Pillow over image bytes and hand its EXIF to :func:`extract_placement`.

    Any failure (no EXIF at all) yields an empty placement.
    """
    try:
        import io

        from PIL import Image
        from PIL.ExifTags import GPSTAGS, TAGS

        with Image.open(io.BytesIO(image_bytes)) as img:
            exif = img.getexif()
        raw: dict = {}

        for tag_id, value in exif.items():
            if TAGS.get(tag_id) == "DateTimeOriginal" and isinstance(value, str):
                # EXIF datetime format: "YYYY:MM:DD HH:MM:SS"
                try:
                    raw["DateTimeOriginal"] = datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
                except ValueError:
                    pass

        gps_ifd = exif.get_ifd(0x8825) if hasattr(exif, "get_ifd") else {}
        gps = {GPSTAGS.get(k, k): v for k, v in (gps_ifd or {}).items()}
        lat = _dms_to_decimal(gps.get("GPSLatitude"), gps.get("GPSLatitudeRef"))
        lon = _dms_to_decimal(gps.get("GPSLongitude"), gps.get("GPSLongitudeRef"))
        if lat is not None and lon is not None:
            raw["latitude"], raw["longitude"] = lat, lon

        # DateTimeOriginal often lives in the Exif sub-IFD, not the base IFD.
        if "DateTimeOriginal" not in raw and hasattr(exif, "get_ifd"):
            sub = exif.get_ifd(0x8769) or {}
            for tag_id, value in sub.items():
                if TAGS.get(tag_id) == "DateTimeOriginal" and isinstance(value, str):
                    try:
                        raw["DateTimeOriginal"] = datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
                    except ValueError:
                        pass

        return extract_placement(raw)
    except Exception:
        return {}
