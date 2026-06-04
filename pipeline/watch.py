"""Inbox watcher: turn dropped photos into web-ready splats, automatically.

Runs on the GPU box in the conda `sharp` env (it reuses pipeline.reconstruct).
Polls RECON_INBOX; for each image with no <id>.sog in public/memories yet, runs
SHARP + convert-splats, drops the assets into public/memories, and calls the web
API to flip the record to `ready` (or `failed`). The web process never runs SHARP
— this is the decoupled GPU-side half.

Usage (in the `sharp` env):
    python -m pipeline.watch

The web app's port is auto-discovered (Next bumps 3000 -> 3001 when busy), so the
watcher finds it whether you're on 3000 or 3001. Set WEB_BASE_URL to override (e.g.
a remote/exhibition box).

Config via env:
    WEB_BASE_URL        override; default = auto-probe localhost:3000-3003
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

# localhost must never go through a system/corporate HTTP proxy (it would stall),
# so all our local calls use an opener that ignores proxy settings.
_LOCAL = urllib.request.build_opener(urllib.request.ProxyHandler({}))


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


def candidate_ports(env=None):
    """Ports to probe for the running web app, in order. An explicit dev `PORT`
    (Next bumps to 3001/3002 when 3000 is taken) is tried first, then the usual
    Next dev/start range."""
    env = os.environ if env is None else env
    ports = []
    p = env.get("PORT")
    if p and p.isdigit():
        ports.append(int(p))
    for d in (3000, 3001, 3002, 3003):
        if d not in ports:
            ports.append(d)
    return ports


def _probe_api(base_url):
    """True if base_url serves our memories API (GET returns a store with records).
    Validating the body shape avoids latching onto an unrelated app on the port.
    Short timeout so a dead/squatted port doesn't stall startup."""
    try:
        with _LOCAL.open(f"{base_url}/api/memories", timeout=1) as r:
            if r.status != 200:
                return False
            body = json.loads(r.read().decode())
        return isinstance(body, dict) and isinstance(body.get("records"), list)
    except Exception:
        return False


def resolve_base_url(env=None, probe=None):
    """Figure out where the web app is listening. `WEB_BASE_URL` wins if set
    (remote/exhibition box); otherwise probe localhost across `candidate_ports`
    and use the first that actually serves our API. Falls back to the first
    candidate if none answer (callbacks then fail-soft and the curator can ingest
    from /admin)."""
    env = os.environ if env is None else env
    explicit = env.get("WEB_BASE_URL")
    if explicit:
        return explicit
    probe = probe or _probe_api
    ports = candidate_ports(env)
    for port in ports:
        url = f"http://localhost:{port}"
        if probe(url):
            return url
    return f"http://localhost:{ports[0]}"


def post_json(url, payload=None):
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(
        url, data=data, method="POST", headers={"content-type": "application/json"}
    )
    _LOCAL.open(req, timeout=15).close()


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
    except Exception as e:  # GPU/convert/copy failure -> mark failed, quarantine input
        try:
            on_fail(id, str(e))
        except Exception as notify_err:
            print(f"[watch] WARNING: could not notify fail for {id}: {notify_err}")
        try:
            move_to_failed(image_path, inbox)
        except Exception as move_err:
            print(f"[watch] WARNING: could not quarantine {id}: {move_err}")
        return
    # Assets are committed to public_dir. A ready-notify failure here is only a
    # notification glitch, not a reconstruction failure — log it and leave the
    # record for the curator to ingest from /admin; do NOT mark it failed.
    try:
        on_ready(id)
    except Exception as notify_err:
        print(f"[watch] WARNING: {id} reconstructed but ready-notify failed: {notify_err}")


def main():
    base_url = resolve_base_url()
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
