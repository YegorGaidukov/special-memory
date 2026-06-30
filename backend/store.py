"""The contribution store: a single JSON file holding every lifecycle state.

Port of ``web/src/server/store.ts``. Pure ops (empty/find/add/update) are unit-tested;
load/save are the filesystem seam. One file is enough at this scale (tens-hundreds of
memories). Records are plain dicts matching the JSON on disk.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from .config import STORE_PATH


def empty_store() -> dict:
    return {"records": []}


def find_by_id(store: dict, record_id: str) -> Optional[dict]:
    for r in store["records"]:
        if r.get("id") == record_id:
            return r
    return None


def add_record(store: dict, record: dict) -> dict:
    """Append immutably (returns a new store; input untouched)."""
    return {"records": [*store["records"], record]}


def update_record(store: dict, record_id: str, patch: dict) -> dict:
    """Patch a single record by id, immutably; no-op for an unknown id. ``id`` is kept."""
    records = []
    for r in store["records"]:
        if r.get("id") == record_id:
            merged = {**r, **patch, "id": r["id"]}
            records.append(merged)
        else:
            records.append(r)
    return {"records": records}


# --- filesystem seam ------------------------------------------------------------

def load_store(path: Path = STORE_PATH) -> dict:
    """Read the store, tolerating a missing file (first run -> empty)."""
    try:
        raw = Path(path).read_text(encoding="utf8")
    except FileNotFoundError:
        return empty_store()
    parsed = json.loads(raw)
    return parsed if isinstance(parsed.get("records"), list) else empty_store()


def save_store(store: dict, path: Path = STORE_PATH) -> None:
    """Write the store, creating the data directory if needed."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2), encoding="utf8")
