# Deploy — Collective Memory City on ki-pc

Architecture **A** (see `docs/superpowers/specs/2026-06-30-s4-phone-companion-and-ki-pc-deployment-design.md`):
everything runs **same-origin** on the ki-pc GPU box behind **Caddy/HTTPS** —

- **Backend**: FastAPI (`backend/`) + the Python `pipeline/` (SHARP runs **inline**).
- **Frontend**: the Next.js **static export** (`web/out/`), served by Caddy.
- **Caddy**: TLS (Let's Encrypt), the COOP/COEP headers the splat renderer needs, and a
  reverse proxy for `/api`, `/assets`, `/ws` → the backend.

The **projector** is just a kiosk browser pointed at the domain; **phones** open `/m` on the same domain.

## Recommended: run the backend natively in the `sharp` conda env

SHARP needs native CUDA; the existing dev/exhibition setup already has the `sharp` conda env with a
CUDA build of torch. Running the backend there gives the GPU directly — no CUDA-in-Docker.

```powershell
conda activate sharp
pip install -r requirements-backend.txt        # FastAPI/uvicorn/pillow (one time)
# from the repo root:
uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

The backend reads/writes the same `web/data/` (store, uploads, inbox) and `web/public/memories/`
(assets, manifest) directories the frontend serves from. Override with `PUBLIC_MEMORIES_DIR`,
`MEMORIES_STORE_PATH`, `UPLOADS_DIR`, `RECON_INBOX` if you relocate them.

## Build the static frontend

```powershell
cd web
npm ci
STATIC_EXPORT=1 npm run build        # -> web/out/
```

Set `NEXT_BASE_PATH=/memory-city` before building **only** if serving under a subpath of the shared
chair domain (then prefix the Caddy paths accordingly). A dedicated subdomain needs no basePath.

## Caddy

`deploy/Caddyfile` is a dedicated-domain example: it sets cross-origin isolation, proxies the backend,
and serves `web/out` as static files. Point `root` at the absolute path of `web/out` on ki-pc, then:

```powershell
caddy run --config deploy/Caddyfile        # native Windows Caddy
# or integrate the block into the chair's shared Caddyfile (docs/server-connection.md, Option A)
```

Caddy auto-upgrades WebSocket connections, so `/ws/*` (the joystick) needs no special config.

## Optional: containerise the backend

If you prefer Docker (CUDA-in-Docker needs WSL2 GPU support on Windows), `deploy/Dockerfile` +
`deploy/docker-compose.snippet.yml` build the backend image; SHARP (`ml-sharp`) must be available to
the build (see the Dockerfile comments). The native conda approach above is simpler on ki-pc.

## Local dev (laptop)

```powershell
# terminal 1 — backend (in the sharp env, with GPU for real reconstruction)
uvicorn backend.app:app --reload --port 8000
# terminal 2 — frontend dev server (proxies /api + /assets to :8000 via next.config rewrites)
cd web && npm run dev        # http://localhost:3000
```

No CORS/COEP friction in dev: the Next dev server proxies the backend so the frontend stays
same-origin, mirroring prod.
