"""The explorer manifest: strict parse/validate + the publish projection.

Combines ports of ``web/src/lib/manifest/parse.ts`` (the explorer's strict parser,
used here to validate published output) and ``web/src/server/publish.ts`` (the curated
gate: only ``approved`` records reach the explorer; hand-authored seed memories are
preserved across publishes).
"""
from __future__ import annotations

import math
from typing import Sequence

# A memory is only shown once it has a splat to render. Lifecycle states without one
# (uploaded/processing/failed) are filtered out — that's normal, not an error.
RENDERABLE_STATUSES = frozenset({"ready", "approved"})


# --- strict parser (port of lib/manifest/parse.ts) ------------------------------

def _is_finite_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _as_string(v, ctx: str) -> str:
    if not isinstance(v, str):
        raise ValueError(f"{ctx}: expected string")
    return v


def _as_number(v, ctx: str) -> float:
    if not _is_finite_number(v):
        raise ValueError(f"{ctx}: expected a finite number")
    return v


def _as_number_array(v, length: int, ctx: str) -> list:
    if not isinstance(v, list) or len(v) != length:
        raise ValueError(f"{ctx}: expected a {length}-element number array")
    return [_as_number(x, f"{ctx}[{i}]") for i, x in enumerate(v)]


def _parse_transform(v, ctx: str) -> dict:
    if not isinstance(v, dict):
        raise ValueError(f"{ctx}: missing transform")
    position = _as_number_array(v.get("position"), 3, f"{ctx}.position")
    quaternion = _as_number_array(v.get("quaternion"), 4, f"{ctx}.quaternion")
    scale = (
        _as_number(v.get("scale"), f"{ctx}.scale")
        if _is_finite_number(v.get("scale"))
        else _as_number_array(v.get("scale"), 3, f"{ctx}.scale")
    )
    return {"position": position, "quaternion": quaternion, "scale": scale}


def _parse_geo(v, ctx: str) -> dict:
    if not isinstance(v, dict):
        raise ValueError(f"{ctx}: expected an object")
    return {"lat": _as_number(v.get("lat"), f"{ctx}.lat"), "lon": _as_number(v.get("lon"), f"{ctx}.lon")}


def _parse_memory(v, idx: int) -> dict:
    ctx = f"memories[{idx}]"
    if not isinstance(v, dict):
        raise ValueError(f"{ctx}: expected an object")
    record = {
        "id": _as_string(v.get("id"), f"{ctx}.id"),
        "status": _as_string(v.get("status"), f"{ctx}.status"),
        "thumbnail_url": _as_string(v.get("thumbnail_url"), f"{ctx}.thumbnail_url"),
        "splat_url": _as_string(v.get("splat_url"), f"{ctx}.splat_url"),
        "transform": _parse_transform(v.get("transform"), f"{ctx}.transform"),
    }
    if v.get("captured_at") is not None:
        record["captured_at"] = _as_string(v.get("captured_at"), f"{ctx}.captured_at")
    if v.get("geo") is not None:
        record["geo"] = _parse_geo(v.get("geo"), f"{ctx}.geo")
    if v.get("heading_deg") is not None:
        record["heading_deg"] = _as_number(v.get("heading_deg"), f"{ctx}.heading_deg")
    if v.get("created_at") is not None:
        record["created_at"] = _as_string(v.get("created_at"), f"{ctx}.created_at")
    if v.get("audio_url") is not None:
        record["audio_url"] = _as_string(v.get("audio_url"), f"{ctx}.audio_url")
    return record


def _parse_city(v) -> dict:
    if not isinstance(v, dict):
        raise ValueError("manifest.city: missing city config")
    return {
        "name": _as_string(v.get("name"), "city.name"),
        "origin_lat": _as_number(v.get("origin_lat"), "city.origin_lat"),
        "origin_lon": _as_number(v.get("origin_lon"), "city.origin_lon"),
    }


def parse_manifest(raw) -> dict:
    """Validate and type a raw explorer manifest. Raises on structural errors;
    filters memories to those that can actually be rendered."""
    if not isinstance(raw, dict):
        raise ValueError("manifest: expected an object")
    city = _parse_city(raw.get("city"))
    memories = raw.get("memories")
    if not isinstance(memories, list):
        raise ValueError("manifest.memories: expected an array")
    parsed = [_parse_memory(m, i) for i, m in enumerate(memories)]
    parsed = [m for m in parsed if m["status"] in RENDERABLE_STATUSES]
    return {"city": city, "memories": parsed}


# --- publish projection (port of server/publish.ts) -----------------------------

def _to_memory_record(record: dict) -> dict:
    """Strip the server-only ``source_image`` (and ``error``) fields."""
    return {k: v for k, v in record.items() if k not in ("source_image", "error")}


def to_explorer_manifest(store: dict, city: dict) -> dict:
    """Pure projection: full store -> the explorer's manifest shape (approved only)."""
    return {
        "city": city,
        "memories": [
            _to_memory_record(r) for r in store["records"] if r.get("status") == "approved"
        ],
    }


def merge_manifest(existing_memories: Sequence[dict], store: dict, city: dict) -> dict:
    """Merge published output with externally-authored entries.

    Entries whose id is NOT in the store (hand-curated seeds) are preserved; the
    store's approved records are appended; stale entries for store-managed ids drop.
    """
    store_ids = {r["id"] for r in store["records"]}
    external = [m for m in existing_memories if m.get("id") not in store_ids]
    approved = to_explorer_manifest(store, city)["memories"]
    return {"city": city, "memories": [*external, *approved]}


def patch_manifest_memory_transform(raw: dict, record_id: str, transform: dict) -> dict:
    """Pure: replace one memory's ``transform`` in a raw manifest, preserving other
    fields. Returns ``{"manifest": ..., "found": bool}``."""
    memories = raw.get("memories")
    memories = memories if isinstance(memories, list) else []
    found = False
    nxt = []
    for m in memories:
        if isinstance(m, dict) and m.get("id") == record_id:
            found = True
            nxt.append({**m, "transform": transform})
        else:
            nxt.append(m)
    return {"manifest": {**raw, "memories": nxt}, "found": found}
