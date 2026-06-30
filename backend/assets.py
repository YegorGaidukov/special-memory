"""Pure helpers for serving memory assets (.sog / .preview.ply / .jpg / manifest.json).

Port of ``web/src/server/asset.ts``. Assets are written into PUBLIC_MEMORIES_DIR at
runtime by the inline reconstruction, then served from a flat directory — so a valid
filename is a single path segment with no separators, traversal, or NUL.
"""
from __future__ import annotations

import os

_CONTENT_TYPES = {
    ".sog": "application/octet-stream",
    ".ply": "application/octet-stream",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webm": "audio/webm",
}


def asset_content_type(name: str) -> str:
    """Content type for an asset filename, defaulting to a binary download."""
    ext = os.path.splitext(name)[1].lower()
    return _CONTENT_TYPES.get(ext, "application/octet-stream")


def safe_asset_name(name: str):
    """Return the clean filename, or ``None`` if unsafe (separators/traversal/NUL)."""
    if not name or name in (".", ".."):
        return None
    if any(c in name for c in ("\\", "/", "\0")):
        return None
    if ".." in name:
        return None
    return name
