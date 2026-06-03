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


def scan_inbox(inbox):
    """Map stem -> image path for top-level images in the inbox (skips failed/)."""
    inbox = Path(inbox)
    if not inbox.exists():
        return {}
    return {
        p.stem: p
        for p in sorted(inbox.iterdir())
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    }


def ready_stems(public_dir):
    """Stems already reconstructed (a <stem>.sog exists in public/memories)."""
    public_dir = Path(public_dir)
    if not public_dir.exists():
        return set()
    return {p.stem for p in public_dir.iterdir() if p.suffix.lower() == ".sog"}


def run_convert(splats_dir, public_dir):
    """Invoke the Node convert-splats step (.ply -> .sog + .preview.ply)."""
    subprocess.run(
        ["node", str(CONVERT_SCRIPT), str(splats_dir), str(public_dir)],
        check=True,
    )


def post_json(url, payload=None):
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(
        url, data=data, method="POST", headers={"content-type": "application/json"}
    )
    urllib.request.urlopen(req, timeout=15).close()


def notify_ready(base_url, id):
    post_json(f"{base_url}/api/memories/{id}/ingest")


def notify_fail(base_url, id, error):
    post_json(f"{base_url}/api/memories/{id}/fail", {"error": error})


def move_to_failed(image_path, inbox):
    failed = Path(inbox) / "failed"
    failed.mkdir(parents=True, exist_ok=True)
    shutil.move(str(image_path), str(failed / Path(image_path).name))


def process_one(
    id,
    image_path,
    *,
    public_dir,
    inbox,
    base_url,
    reconstruct=reconstruct,
    convert=run_convert,
    on_ready=None,
    on_fail=None,
):
    """Reconstruct one image into public_dir and signal the web API. The SHARP run,
    the convert step, and the HTTP callbacks are injected so this is unit-testable
    without a GPU, Node, or a running server."""
    on_ready = on_ready or (lambda i: notify_ready(base_url, i))
    on_fail = on_fail or (lambda i, e: notify_fail(base_url, i, e))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            in_dir = Path(tmp) / "in"
            in_dir.mkdir()
            shutil.copy(str(image_path), str(in_dir / Path(image_path).name))
            out_dir = Path(tmp) / "out"
            reconstruct(in_dir, out_dir)
            convert(out_dir / "splats", public_dir)
            shutil.copy(
                str(out_dir / "thumbs" / f"{id}.jpg"),
                str(Path(public_dir) / f"{id}.jpg"),
            )
        on_ready(id)
    except Exception as e:  # GPU/convert/copy failure -> mark failed, quarantine input
        on_fail(id, str(e))
        move_to_failed(image_path, inbox)


def main():
    base_url = os.environ.get("WEB_BASE_URL", "http://localhost:3000")
    interval = float(os.environ.get("WATCH_INTERVAL_SEC", "3"))
    inbox = Path(os.environ.get("RECON_INBOX") or REPO_ROOT / "web" / "data" / "inbox")
    public_dir = Path(
        os.environ.get("PUBLIC_MEMORIES_DIR") or REPO_ROOT / "web" / "public" / "memories"
    )
    public_dir.mkdir(parents=True, exist_ok=True)
    print(f"[watch] inbox={inbox} public={public_dir} api={base_url} every {interval}s")
    while True:
        images = scan_inbox(inbox)
        pending = select_pending(set(images), ready_stems(public_dir), set())
        for id in pending:
            print(f"[watch] reconstructing {id} …")
            process_one(id, images[id], public_dir=public_dir, inbox=inbox, base_url=base_url)
        time.sleep(interval)


if __name__ == "__main__":
    main()
