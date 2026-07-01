"""FastAPI app: the explorer's backend (uploads, store, manifest, assets).

Replaces the Next.js Route Handlers. Same-origin behind Caddy on ki-pc in production;
``CORS_ORIGINS`` lets the dev frontend (localhost) call a locally-run backend. The
real-time joystick (WebSocket) is added in Phase 5.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import (
    BackgroundTasks,
    FastAPI,
    Form,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import config, services
from .control import Controller, client_is_present, parse_control_state, parse_place
from .assets import asset_content_type, safe_asset_name
from .exifdata import parse_placement, resolve_captured_at
from .ids import ext_of, make_record_id
from .placement import placement_transform, scatter_near_cluster
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


# MediaRecorder output varies by browser (Chrome: webm/opus; Safari/iOS: mp4/aac).
# Map the uploaded blob's content type to a sensible on-disk extension.
_AUDIO_EXT = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/aac": ".m4a",
    "audio/mpeg": ".mp3",
}


def _audio_ext(content_type: Optional[str]) -> str:
    base = (content_type or "").split(";")[0].strip().lower()
    return _AUDIO_EXT.get(base, ".webm")


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
    placement_mode: Optional[str] = Form(None, alias="placement"),
    captured_at: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
    audio: Optional[UploadFile] = None,
):
    data = await photo.read()
    if not data:
        return Response("missing 'photo' file field", status_code=400)

    record_id = make_record_id(photo.filename or "memory")
    filename = f"{record_id}{ext_of(photo.filename or '')}"

    uploads_dir = Path(config.UPLOADS_DIR)
    inbox_dir = Path(config.RECON_INBOX)
    public_dir = Path(config.PUBLIC_MEMORIES_DIR)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    inbox_dir.mkdir(parents=True, exist_ok=True)
    upload_path = uploads_dir / filename
    upload_path.write_bytes(data)
    (inbox_dir / filename).write_bytes(data)

    placement = parse_placement(data)
    geo = placement.get("geo")

    # Placement priority: EXIF GPS -> phone "scatter near cluster" -> camera-front -> origin.
    if geo is None and placement_mode == "scatter":
        position = scatter_near_cluster(services.current_memory_positions())
        transform = {"position": position, "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1]}
    else:
        transform = placement_transform(
            geo=geo,
            camera_position=_parse_vec3(camera_position),
            camera_forward=_parse_vec3(camera_forward),
            origin=config.ORIGIN,
            standoff=config.FLY_TO_STANDOFF,
        )

    # Capture time: the submitted date wins (the phone prefills from EXIF and lets
    # the user edit); EXIF is the fallback for flows without a date field.
    when = resolve_captured_at(placement.get("captured_at"), captured_at)

    # Optional voice note: saved straight into public/memories (no reconstruction).
    audio_url = None
    if audio is not None:
        audio_bytes = await audio.read()
        if audio_bytes:
            audio_name = f"{record_id}{_audio_ext(audio.content_type)}"
            public_dir.mkdir(parents=True, exist_ok=True)
            (public_dir / audio_name).write_bytes(audio_bytes)
            audio_url = audio_name

    record = {
        "id": record_id,
        "status": "processing",
        "source_image": filename,
        "thumbnail_url": "",
        "splat_url": "",
        "transform": transform,
        "geo": geo,
        "heading_deg": 0 if geo else None,
        "captured_at": when,
        "created_at": _now_iso(),
    }
    if name and name.strip():
        record["name"] = name.strip()
    if audio_url:
        record["audio_url"] = audio_url
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


# --- real-time joystick (single driver) -----------------------------------------

_controller = Controller(idle_timeout=8.0)
_displays: set[WebSocket] = set()


async def _broadcast(payload: dict) -> None:
    for ws in list(_displays):
        try:
            await ws.send_json(payload)
        except Exception:
            _displays.discard(ws)


async def _broadcast_control() -> None:
    driving = _controller.current_driver(time.monotonic()) is not None
    await _broadcast({"type": "control", **_controller.state(), "driver": driving})


def _is_present(ws: WebSocket) -> bool:
    """Whether this phone counts as "in the venue" — the presence gate. Its IP is read
    from ``ws.client`` (the real phone IP behind Caddy only with uvicorn
    --forwarded-allow-ips). Empty allowlist => gating off => always present."""
    ip = ws.client.host if ws.client else None
    return client_is_present(ip, config.DRIVE_PRESENCE_CIDRS)


@app.websocket("/ws/control")
async def control_ws(ws: WebSocket):
    """The projector connects as ?role=display (receives the driver's control state);
    phones connect as ?role=controller&clientId=... and send request/release/state."""
    await ws.accept()
    role = ws.query_params.get("role", "controller")
    client_id = ws.query_params.get("clientId") or str(id(ws))

    if role == "display":
        _displays.add(ws)
        try:
            await _broadcast_control()  # current snapshot to the new display
            while True:
                await ws.receive_text()  # displays don't send; this detects disconnect
        except WebSocketDisconnect:
            pass
        finally:
            _displays.discard(ws)
        return

    # controller (phone)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if not isinstance(msg, dict):
                continue
            now = time.monotonic()
            mtype = msg.get("type")

            if mtype == "request":
                present = _is_present(ws)
                ok = _controller.request(client_id, now, present)
                reply = {"type": "status", "driving": ok}
                if not ok and not present:
                    reply["reason"] = "remote"  # let the phone explain why it can't drive
                await ws.send_json(reply)
                if ok:
                    # A successful (possibly preempting) claim: refresh the displays so a
                    # takeover zeroes the previous driver's held vector immediately.
                    await _broadcast_control()
            elif mtype == "release":
                _controller.release(client_id)
                await ws.send_json({"type": "status", "driving": False})
                await _broadcast_control()
            elif mtype == "state":
                parsed = parse_control_state(msg)
                ok = _controller.set_state(client_id, parsed, now)
                await ws.send_json({"type": "status", "driving": ok})
                if ok:
                    await _broadcast_control()
                    if "jump" in parsed:
                        await _broadcast({"type": "jump", "target": parsed["jump"]})
                    if "recenter" in parsed:
                        await _broadcast({"type": "recenter"})
                    if "filter" in parsed:
                        await _broadcast(
                            {"type": "filter", "from": parsed["filter"]["from"], "to": parsed["filter"]["to"]}
                        )
            elif mtype == "place":
                # Curation, not driving: relay a memory-move to the display(s)
                # without touching the single-driver token or the control state.
                parsed = parse_place(msg)
                if parsed is not None:
                    await _broadcast(
                        {"type": "place", "id": parsed["id"], "x": parsed["x"], "z": parsed["z"]}
                    )
    except WebSocketDisconnect:
        pass
    finally:
        if _controller.current_driver(time.monotonic()) == client_id:
            _controller.release(client_id)
            await _broadcast_control()
