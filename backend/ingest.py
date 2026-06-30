"""Decide whether a reconstructed record can go ``ready`` and which urls to attach.

Port of ``web/src/server/ingest.ts``. The splat is required; the thumbnail is optional
(used only for far billboards/UI).
"""
from __future__ import annotations

from typing import AbstractSet


def expected_assets(record_id: str) -> dict:
    """Filenames SHARP + convert-splats produce for a record id (by stem)."""
    return {
        "splat": f"{record_id}.sog",
        "preview": f"{record_id}.preview.ply",
        "thumbnail": f"{record_id}.jpg",
    }


def resolve_ingest(record_id: str, present: AbstractSet[str]) -> dict:
    """Given the filenames present in public/memories, decide the transition.

    Returns ``{"ok": True, "patch": {...}}`` or ``{"ok": False, "reason": str}``.
    """
    assets = expected_assets(record_id)
    if assets["splat"] not in present:
        return {"ok": False, "reason": f"splat {assets['splat']} not found in public/memories"}
    return {
        "ok": True,
        "patch": {
            "status": "ready",
            "splat_url": assets["splat"],
            "thumbnail_url": assets["thumbnail"] if assets["thumbnail"] in present else "",
        },
    }
