"""Inbox watcher: turn dropped photos into web-ready splats, automatically.

Runs on the GPU box in the conda `sharp` env (it reuses pipeline.reconstruct).
Polls RECON_INBOX; for each image with no <id>.sog in public/memories yet, runs
SHARP + convert-splats, drops the assets into public/memories, and calls the web
API to flip the record to `ready` (or `failed`). The web process never runs SHARP
— this is the decoupled GPU-side half.

Usage (in the `sharp` env):
    python -m pipeline.watch

Config via env:
    WEB_BASE_URL        default http://localhost:3000
    WATCH_INTERVAL_SEC  default 3
    RECON_INBOX         default <repo>/web/data/inbox
    PUBLIC_MEMORIES_DIR default <repo>/web/public/memories
"""
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

from pipeline.cli import reconstruct
from pipeline.manifest import IMAGE_EXTS

REPO_ROOT = Path(__file__).resolve().parent.parent
CONVERT_SCRIPT = REPO_ROOT / "web" / "scripts" / "convert-splats.mjs"


def select_pending(inbox_stems, ready, in_flight):
    """Inbox stems with no produced .sog yet and not already being processed."""
    return [s for s in sorted(inbox_stems) if s not in ready and s not in in_flight]
