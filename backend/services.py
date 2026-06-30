"""Filesystem-bound orchestration: upload, inline reconstruction, ingest, publish.

These wrap the pure logic (store/manifest/ingest/placement) with disk I/O and the
reconstruction seams. A module-level lock serialises store mutations so concurrent
uploads/background reconstructions don't clobber the JSON file. Paths are read from
:mod:`backend.config` at call time so tests can monkeypatch them.
"""
from __future__ import annotations

import json
import shutil
import tempfile
import threading
from pathlib import Path

from . import config
from .ingest import resolve_ingest
from .manifest import (
    merge_manifest,
    parse_manifest,
    patch_manifest_memory_transform,
)
from .reconstruct import run_convert, run_reconstruct
from .store import add_record, find_by_id, load_store, save_store, update_record

# Serialises read-modify-write of the store across upload + background recon threads.
_store_lock = threading.RLock()


# --- store mutation under lock --------------------------------------------------

def add_record_locked(record: dict) -> dict:
    with _store_lock:
        store = load_store(config.STORE_PATH)
        store = add_record(store, record)
        save_store(store, config.STORE_PATH)
    return record


def update_record_locked(record_id: str, patch: dict):
    with _store_lock:
        store = load_store(config.STORE_PATH)
        if find_by_id(store, record_id) is None:
            return None
        store = update_record(store, record_id, patch)
        save_store(store, config.STORE_PATH)
        return find_by_id(store, record_id)


# --- publish (fs seam) ----------------------------------------------------------

def _manifest_path() -> Path:
    return Path(config.PUBLIC_MEMORIES_DIR) / "manifest.json"


def publish_manifest() -> None:
    """Merge the store's approved records with any hand-authored manifest entries
    and write public/memories/manifest.json."""
    path = _manifest_path()
    existing: list = []
    try:
        existing = parse_manifest(json.loads(path.read_text(encoding="utf8")))["memories"]
    except Exception:
        existing = []  # missing/unreadable -> nothing external to preserve
    with _store_lock:
        store = load_store(config.STORE_PATH)
        manifest = merge_manifest(existing, store, config.CITY)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2), encoding="utf8")


def patch_published_transform(record_id: str, transform: dict) -> bool:
    """Patch a single memory's transform directly in the published manifest (for
    hand-authored seed memories not in the store). False if missing/unreadable."""
    path = _manifest_path()
    try:
        raw = json.loads(path.read_text(encoding="utf8"))
    except Exception:
        return False
    result = patch_manifest_memory_transform(raw, record_id, transform)
    if not result["found"]:
        return False
    path.write_text(json.dumps(result["manifest"], indent=2), encoding="utf8")
    return True


# --- ingest (fs seam) -----------------------------------------------------------

def ingest_from_disk(record_id: str) -> dict:
    """List public/memories and run resolve_ingest against it."""
    public_dir = Path(config.PUBLIC_MEMORIES_DIR)
    present = set(p.name for p in public_dir.iterdir()) if public_dir.exists() else set()
    return resolve_ingest(record_id, present)


def approve_and_publish(record_id: str):
    """ingest -> ready (asset urls) -> approved -> publish. Returns the record or
    None if the splat assets aren't present yet."""
    result = ingest_from_disk(record_id)
    if not result["ok"]:
        return None
    update_record_locked(record_id, result["patch"])
    record = update_record_locked(record_id, {"status": "approved"})
    publish_manifest()
    return record


# --- inline reconstruction ------------------------------------------------------

def process_upload(
    record_id: str,
    image_path: Path,
    *,
    reconstruct=run_reconstruct,
    convert=run_convert,
) -> None:
    """Reconstruct one uploaded image into public/memories, then auto-approve +
    publish. Runs in a background thread. The SHARP run and the convert step are
    injected so this is unit-testable without a GPU or Node. On failure the record
    is marked ``failed`` and the input is quarantined."""
    public_dir = Path(config.PUBLIC_MEMORIES_DIR)
    image_path = Path(image_path)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            in_dir = Path(tmp) / "in"
            in_dir.mkdir()
            shutil.copy(str(image_path), str(in_dir / image_path.name))
            out_dir = Path(tmp) / "out"
            reconstruct(in_dir, out_dir)
            convert(out_dir / "splats", public_dir)
            thumb = out_dir / "thumbs" / f"{record_id}.jpg"
            if thumb.exists():
                public_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy(str(thumb), str(public_dir / f"{record_id}.jpg"))
    except Exception as exc:  # GPU/convert/copy failure -> failed + quarantine
        update_record_locked(record_id, {"status": "failed", "error": str(exc)})
        _quarantine(image_path)
        return
    if approve_and_publish(record_id) is None:
        update_record_locked(
            record_id,
            {"status": "failed", "error": "reconstruction produced no splat"},
        )


def _quarantine(image_path: Path) -> None:
    try:
        failed = Path(config.RECON_INBOX) / "failed"
        failed.mkdir(parents=True, exist_ok=True)
        if image_path.exists():
            shutil.move(str(image_path), str(failed / image_path.name))
    except Exception:
        pass
