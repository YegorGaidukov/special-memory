"""Resolved server config + directories.

City constants mirror ``web/src/config/explorer.ts`` (CITY, FLY_TO_STANDOFF). Default
paths point at the existing ``web/`` data + asset directories so the backend, the
static frontend, and any leftover tooling share one set of files; env vars override
them for the exhibition box. Reconstruction runs inline (see :mod:`backend.reconstruct`).
"""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = REPO_ROOT / "web"

# City (Wolfsburg) — the shared real-world coordinate origin.
CITY = {"name": "Wolfsburg", "origin_lat": 52.4227, "origin_lon": 10.7865}
ORIGIN = {"lat": CITY["origin_lat"], "lon": CITY["origin_lon"]}

# Metres in front of the camera a GPS-less desktop drop lands (matches FLY_TO_STANDOFF).
FLY_TO_STANDOFF = 10.0


def _dir(env: str, default: Path) -> Path:
    return Path(os.environ.get(env, str(default)))


UPLOADS_DIR = _dir("UPLOADS_DIR", WEB_DIR / "data" / "uploads")
RECON_INBOX = _dir("RECON_INBOX", WEB_DIR / "data" / "inbox")
PUBLIC_MEMORIES_DIR = _dir("PUBLIC_MEMORIES_DIR", WEB_DIR / "public" / "memories")
STORE_PATH = _dir("MEMORIES_STORE_PATH", WEB_DIR / "data" / "memories.json")

# Comma-separated allowed CORS origins (dev frontend); same-origin in prod needs none.
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

# Presence-gated driving: the projector shows a short "drive code" that rotates every
# DRIVE_CODE_ROTATE_S seconds; a phone must submit the current (or just-previous) code to
# take control, proving it can read the projected screen — so a visitor who left the venue
# (or re-opened the tab from home) can't drive, and any present visitor can preempt a stale
# holder. Set DRIVE_CODE_ENABLED=0 for legacy first-come-wins (e.g. a display-less dev box).
DRIVE_CODE_ENABLED = os.environ.get("DRIVE_CODE_ENABLED", "1") != "0"
DRIVE_CODE_ROTATE_S = float(os.environ.get("DRIVE_CODE_ROTATE_S", "60"))
