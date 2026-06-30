"""FastAPI app: the explorer's backend (uploads, store, manifest, assets).

Replaces the Next.js Route Handlers. Same-origin behind Caddy on ki-pc in production;
``CORS_ORIGINS`` lets the dev frontend (localhost) call a locally-run backend. The
real-time joystick (WebSocket) is added in Phase 5.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, Form, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import config, services
from .assets import asset_content_type, safe_asset_name
from .exifdata import parse_placement
from .ids import ext_of, make_record_id
from .placement import placement_transform
from .store import find_by_id, load_store
from .transform_validate import is_valid_transform

app = FastAPI(title="Collective Memory City backend")

if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type"],
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + (
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"
    )


def _parse_vec3(raw: Optional[str]):
    if not raw:
        return None
    try:
        v = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if isinstance(v, list) and len(v) == 3 and all(
        isinstance(n, (int, float)) and not isinstance(n, bool) for n in v
    ):
        return [float(v[0]), float(v[1]), float(v[2])]
    return None


# --- memories -------------------------------------------------------------------

@app.get("/api/memories")
def list_memories():
    return load_store(config.STORE_PATH)


@app.get("/api/memories/{record_id}")
def get_memory(record_id: str):
    record = find_by_id(load_store(config.STORE_PATH), record_id)
    if record is None:
        return Response("not found", status_code=404)
    return {"record": record}


@app.post("/api/memories")
async def create_memory(
    background: BackgroundTasks,
    photo: UploadFile,
    camera_position: Optional[str] = Form(None),
    camera_forward: Optional[str] = Form(None),
):
    data = await photo.read()
    if not data:
        return Response("missing 'photo' file field", status_code=400)

    record_id = make_record_id(photo.filename or "memory")
    filename = f"{record_id}{ext_of(photo.filename or '')}"

    uploads_dir = Path(config.UPLOADS_DIR)
    inbox_dir = Path(config.RECON_INBOX)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    inbox_dir.mkdir(parents=True, exist_ok=True)
    upload_path = uploads_dir / filename
    upload_path.write_bytes(data)
    (inbox_dir / filename).write_bytes(data)

    placement = parse_placement(data)
    transform = placement_transform(
        geo=placement.get("geo"),
        camera_position=_parse_vec3(camera_position),
        camera_forward=_parse_vec3(camera_forward),
        origin=config.ORIGIN,
        standoff=config.FLY_TO_STANDOFF,
    )

    record = {
        "id": record_id,
        "status": "processing",
        "source_image": filename,
        "thumbnail_url": "",
        "splat_url": "",
        "transform": transform,
        "geo": placement.get("geo"),
        "heading_deg": 0 if placement.get("geo") else None,
        "captured_at": placement.get("captured_at"),
        "created_at": _now_iso(),
    }
    services.add_record_locked(record)

    # Reconstruct inline (background thread) — SHARP never blocks the response.
    background.add_task(services.process_upload, record_id, upload_path)

    return JSONResponse({"record": record}, status_code=201)


@app.patch("/api/memories/{record_id}/transform")
async def patch_transform(record_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    transform = body.get("transform") if isinstance(body, dict) else None
    if not is_valid_transform(transform):
        return Response(
            "transform must be { position:[x,y,z], quaternion:[x,y,z,w], scale:>0 }",
            status_code=400,
        )

    store = load_store(config.STORE_PATH)
    record = find_by_id(store, record_id)
    if record is not None:
        updated = services.update_record_locked(record_id, {"transform": transform})
        if record.get("status") == "approved":
            services.publish_manifest()
        return {"record": updated}

    if services.patch_published_transform(record_id, transform):
        return {"record": {"id": record_id, "transform": transform}}
    return Response("not found", status_code=404)


@app.post("/api/memories/{record_id}/ingest")
def ingest(record_id: str):
    """Watcher-compatible fallback: flip to ready -> approved -> publish from disk."""
    if find_by_id(load_store(config.STORE_PATH), record_id) is None:
        return Response("not found", status_code=404)
    record = services.approve_and_publish(record_id)
    if record is None:
        result = services.ingest_from_disk(record_id)
        return Response(result.get("reason", "assets missing"), status_code=409)
    return {"record": record}


@app.post("/api/memories/{record_id}/fail")
async def fail(record_id: str, request: Request):
    if find_by_id(load_store(config.STORE_PATH), record_id) is None:
        return Response("not found", status_code=404)
    error = "reconstruction failed"
    try:
        body = await request.json()
        if isinstance(body, dict) and isinstance(body.get("error"), str) and body["error"].strip():
            error = body["error"]
    except Exception:
        pass
    record = services.update_record_locked(record_id, {"status": "failed", "error": error})
    return {"record": record}


# --- assets ---------------------------------------------------------------------

@app.get("/assets/{name}")
def get_asset(name: str):
    safe = safe_asset_name(name)
    if not safe:
        return Response("bad request", status_code=400)
    path = Path(config.PUBLIC_MEMORIES_DIR) / safe
    if not path.is_file():
        return Response("not found", status_code=404)
    return FileResponse(
        path,
        media_type=asset_content_type(safe),
        headers={"cache-control": "public, max-age=0, must-revalidate"},
    )
