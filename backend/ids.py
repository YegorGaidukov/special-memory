"""Filesystem/url-safe record ids derived from the original filename.

Port of ``web/src/server/id.ts``. The id is also the asset stem SHARP matches its
outputs by, so it must be stable and clean.
"""
from __future__ import annotations

import re
import uuid

_SAFE = re.compile(r"[^a-z0-9._-]", re.IGNORECASE)
_EXT = re.compile(r"\.(jpe?g|png)$", re.IGNORECASE)


def make_record_id(original_name: str) -> str:
    """``IMG_1234.jpg`` -> ``IMG_1234-<8 hex>``; unsafe chars -> ``_``; empty -> ``memory``."""
    stem = re.sub(r"\.[^.]+$", "", original_name)
    stem = _SAFE.sub("_", stem)[:40] or "memory"
    return f"{stem}-{uuid.uuid4().hex[:8]}"


def ext_of(original_name: str) -> str:
    """Lowercased extension including the dot, defaulting to ``.jpg``."""
    m = _EXT.search(original_name.lower())
    return m.group(0) if m else ".jpg"
