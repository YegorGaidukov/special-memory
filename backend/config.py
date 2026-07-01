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

# Presence-gated driving (no codes, no friction): only phones whose IP is inside one of
# these CIDRs — the venue's network, e.g. its public egress or LAN — may take control; a
# phone that left the venue (home/cellular) can still view + upload but can't drive.
# Comma-separated, e.g. DRIVE_PRESENCE_CIDRS="203.0.113.0/24,192.168.1.0/24". EMPTY (the
# default) turns gating OFF: control is then plain newest-grab-wins for everyone (a present
# visitor always preempts a departed/idle one, but an active remote user could still fight).
# Behind Caddy, run uvicorn with --forwarded-allow-ips 127.0.0.1 so the real phone IP (not
# the proxy's) is seen — otherwise every client looks like localhost.
DRIVE_PRESENCE_CIDRS = [c.strip() for c in os.environ.get("DRIVE_PRESENCE_CIDRS", "").split(",") if c.strip()]
