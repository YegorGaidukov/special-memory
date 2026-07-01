# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Collective Memory City** — a solo university art installation (tight, ~weeks timeline; the working
web piece *is* the deliverable). People upload photos of **one chosen city**; each photo becomes a
**photorealistic 3D Gaussian-splat "memory"** placed at its real-world location; visitors fly
through a **dark-void world** where memories glow as photoreal islands. The city emerges from
collective memory — dense where remembered, dreamlike at the edges.

**Source of truth (read these first):**
- Design/spec: `docs/superpowers/specs/2026-06-02-collective-memory-city-design.md`
- S1 implementation plan: `docs/superpowers/plans/2026-06-02-s1-reconstruction-pipeline.md`
- S2 explorer docs: `web/README.md` (setup, run, controls, architecture, deferrals)

**Current state:** **S1, S2, and S3 are all built and unit-tested.**
S1 is validated end-to-end on the laptop GPU (`pipeline/` + `tests/`; see `samples/README.md`).
S2 lives in `web/` (Next.js + R3F + Spark splats); it renders the dark void, loads the seed
memories upright, supports free-fly + click-to-travel, and shows a faint Wolfsburg map ground plane
toggled from a slim right-edge **icon toolbar** (Edit / Map / Library — no keyboard shortcuts). The
chrome is Geist-typed and has a top-right **dark/light theme** toggle (flips the whole view incl. the
canvas); a bottom-centre **"share a memory"** button (+ drag-and-drop) is the upload entry, and the
**Library** icon opens a click-to-travel memory list. S3 (also in `web/`) is the **drop-to-splat**
contribution flow, collapsed entirely
into the explorer (no placement or admin pages): drop a photo → transform computed at upload (EXIF
GPS, else in front of the camera) → faint placeholder sphere while the watcher reconstructs →
`ingest` auto-approves + publishes → the splat replaces the sphere on the next poll. Memory assets are
served by a **dynamic route** (`app/api/asset/[name]`), not Next's static `public/` handler — Next only
serves `public/` files that existed at *build* time, so a live drop's runtime-written `.sog` would 404
on `next start`; the route reads `PUBLIC_MEMORIES_DIR` from disk per request (`MEMORIES_BASE_URL`
defaults to `/api/asset`). The web suite is **270 Vitest specs** (pure
geo/manifest/store/publish/exif/upload/pending/map/asset logic; the WebGL viewer,
MapLibre→texture, and route handlers are the mocked/manual seams). **Verify on a production build**
(`npm run build && npm run start`), not dev (HMR remounts the WebGL viewer and throws spurious
errors). Build order was **S1 → S2 → S3**.

## Architecture (big picture)

The reconstruction keystone is **Apple SHARP** (`github.com/apple/ml-sharp`): a feedforward model
that turns a **single image** into a **metric-scaled** 3D Gaussian splat (`.ply`) in ~1s on a
high-end CUDA GPU (measured **~8s/image on the RTX 4060 laptop**; ~1.18M Gaussians, ~63 MB/splat),
with no per-scene training. Metric scale is what lets each memory drop into one shared
real-world coordinate space. The system is three loosely-coupled subsystems linked by a JSON
**manifest** of memory records:

- **S1 — Reconstruction (Python). [BUILT]** A `pipeline/` package wrapping the `sharp predict` CLI
  (modules: `thumbnails`, `sharp_runner`, `manifest`, `cli`). Input image(s) → `.ply` splat +
  thumbnail + `manifest.json`. The heavy GPU call is isolated behind a single seam
  (`pipeline/sharp_runner.run_sharp`) so all other logic is unit-tested without a GPU. Confirmed:
  SHARP writes `<stem>.ply` matching the input filename, so the manifest matches outputs by stem.
- **S2 — Explorer (web). [BUILT]** A `web/` Next.js (App Router) app: React Three Fiber +
  [Spark](https://sparkjs.dev) (`@sparkjsdev/spark`). Renders the dark void and places each
  memory's splat at its stored `transform` (upright, via a SHARP→three.js 180°-about-X frame
  correction in `lib/transform/apply.ts`). FPS free-fly (pointer-lock look + WASD-where-you-look) +
  click-a-memory-to-travel. **Pure logic** (`src/lib/{manifest,transform,camera,lod}`) is
  unit-tested; the WebGL renderer (Spark `SplatMesh`) is the single mocked seam, proven by a manual
  smoke test. **S2 does no geo math** — it only reads stored transforms. Until S3 exists it runs on
  a hand-authored `web/public/memories/manifest.json`. **Performance (scales to hundreds):**
  `npm run convert-splats` turns each SHARP `.ply` into a compressed **SOG** (`.sog`, ~6× smaller,
  loaded up close) plus a decimated **`.preview.ply`** (~4k-point cloud). Rendering uses **distance
  residency** — a memory shows its cheap point-cloud "ghost" until the camera enters
  `LOD.loadRadius`, then **cross-dissolves** into a full `SplatMesh` (smoothstep over
  `PREVIEW.fadeMs`, animating `SplatMesh.opacity` 0→1 against the point cloud's 1→0) and disposes
  back to the point cloud past `disposeRadius` (Spark's race-free `initialized`/`dispose` lifecycle
  drives this from the tested `decideLod` in `src/lib/lod/`). Spark does the global splat sort.
  A faint, toolbar-toggleable **map ground plane** (`MapGround` + `lib/map/*`) renders an offscreen
  MapLibre OSM map once into a `THREE.CanvasTexture`, laid flat under the memories and aligned to the
  same geo projection; styling is config-only via `config/explorer.MAP`. **Deferred:** the
  starfield/grid, and Spark's built-in per-splat LOD (not needed yet).
- **S3 — Contribution (web). [BUILT — drop-to-splat]** The contribution flow is collapsed entirely
  into the explorer: **no `/contribute` or `/admin` pages.** A curator drops a photo on the explorer
  and stays there; the upload route computes the stored `transform` immediately (`lib/upload/placement`:
  EXIF GPS → `geoToTransform`, else a position in front of the live camera, whose pose a tiny in-Canvas
  `CameraPoseProbe` bridges out to the DOM drop handler). A faint pulsing **placeholder ring**
  (`PendingSpheres`, a flat HTML outline marker — not a mesh — fed by `lib/pending/select` over a poll of
  `GET /api/memories`) marks the in-flight memory while the curator keeps exploring. **S3 owns the geo math S2 deliberately omits** —
  `lib/geo/{project,heading,transform}` turns lat/lon + heading + scale into the stored `transform`
  (equirectangular projection about the Wolfsburg origin; heading→yaw quaternion matching the seed
  convention; all pure + unit-tested). State lives in a server-side JSON **store**
  (`web/data/memories.json`, git-ignored) holding the full lifecycle
  (`uploaded → processing → ready → approved`); a pure **publish** step (`server/publish.ts`,
  `mergeManifest`) layers the store's `approved` records on top of any hand-authored manifest
  entries (curated seeds, kept by id) and writes `public/memories/manifest.json`, so the verified S2
  parser/renderer is untouched and curated seeds survive each publish. **SHARP stays
  out of the web process** — the bridge is the filesystem: a drop copies the image to `RECON_INBOX`
  and marks the record `processing`, then a **watcher the curator runs on the GPU box**
  (`python -m pipeline.watch`, in the `sharp` env) reconstructs it, runs `convert-splats`, drops
  `<id>.sog` into `public/memories/`, and calls the `ingest` API — which now **auto-approves +
  republishes** in one step (no admin gate), so the explorer's next poll refetches the manifest, the
  splat loads, and the placeholder sphere drops out (or the `fail` API on error). The web process still
  never runs SHARP. Placement is fine-tuned afterwards in the explorer's **edit mode** (toolbar Edit
  icon → click → drag the unified gumball gizmo; auto-saves; `Esc` exits). Next.js 16 Route Handlers
  (`app/api/memories/**`, plus the dynamic asset route `app/api/asset/[name]` that serves the
  runtime-written splats — see above) wire it together; the routes
  are the manual/seam-tested boundaries (their pure cores, e.g. `server/asset.ts`, are unit-tested). The city is **Wolfsburg** (`config/explorer.CITY`, origin
  52.4227, 10.7865). **No authentication** — curated, locally-run installation, so the contribution
  routes are open by design.

**Memory record (the contract between subsystems):** `id, status, source_image, splat_path,
thumbnail_path, captured_at, geo{lat,lon}, heading_deg, transform{position[x,y,z], quaternion,
scale}`. S1 emits reconstruction-time fields; S3 adds geo/transform. City config carries
`{name, origin_lat, origin_lon}`.

**Geo placement:** memory lat/lon → local meters via equirectangular approximation relative to the
city origin; user-set heading → yaw; SHARP's metric scale → real size.

## Constraints that drive design decisions

- A single-image splat is a **peek-around volume**, not a 360° walkable block — geometry thins past
  the original viewpoint. This is embraced as the "dreamlike edges" aesthetic, not fixed.
- SHARP gives metric **scale** but not world **orientation** → orientation comes from the
  contributor's facing-arrow (EXIF compass is unreliable).
- SHARP **auto-detects** its device (CUDA when available). This already satisfies the
  laptop↔server portability goal; don't add a device flag unless forcing CPU/MPS, via the
  `--sharp-arg` passthrough.
- **Model license is research/non-commercial only** (`ml-sharp/LICENSE_MODEL`) — fine for this
  non-commercial university exhibition; no commercial product/service use of the weights.
- SHARP reads **focal length from EXIF** to set metric scale; absent it, it defaults to 30 mm and
  warns. Messaging-app exports (Telegram/WhatsApp) strip EXIF (no focal length, no GPS) — prefer
  originals, or set/normalize focal length, for correct metric scale.
- **Compute split:** all dev/prototyping runs on a Windows + NVIDIA-GPU laptop; the 96 GB-VRAM
  Windows server is for the **exhibition only**. Keep the pipeline runnable on both unchanged.
- **YAGNI for the MVP** — explicitly deferred: thousands-scale streaming/clustering, crowd
  densification, `.spz` compression, real OSM street lines, user accounts, job-queue service.

## Commands

SHARP and the S1 pipeline share one **Miniconda** env, `sharp` (Python 3.13), at
`C:\Users\egayd\miniconda3\envs\sharp` on the dev laptop. SHARP is checked out at
`C:\Work\GitHub\ml-sharp`. **Unit tests run in a separate `.venv` (Python 3.12) at the repo root** —
the pipeline code is SHARP-independent (GPU mocked behind `sharp_runner.run_sharp`), so no
conda/GPU is needed for them.

```powershell
# One-time env + SHARP install (already done on the dev laptop)
conda create -n sharp python=3.13 -y
conda activate sharp
pip install -r C:\Work\GitHub\ml-sharp\requirements.txt   # SHARP (incl. `-e .` → the `sharp` CLI)
pip install -r requirements-pipeline.txt                  # our deps (pillow, pytest)
# PyPI torch is CPU-only on Windows — install the CUDA build for GPU:
pip install --index-url https://download.pytorch.org/whl/cu128 --force-reinstall torch==2.8.0 torchvision==0.23.0

# Run the reconstruction pipeline (needs `sharp` on PATH → activate the env first)
conda activate sharp
python -m pipeline -i samples\input -o samples\output

# Auto-reconstruct dropped photos: watch the web inbox and process new uploads
# (run on the GPU box, in the `sharp` env; needs the web app running for the callbacks)
python -m pipeline.watch

# Run SHARP directly
sharp predict -i <input_image_dir> -o <output_dir>

# Tests (no GPU/conda — use the .venv)
.\.venv\Scripts\python.exe -m pytest                              # full suite
.\.venv\Scripts\python.exe -m pytest tests/test_thumbnails.py -v  # one file
```

The first SHARP run auto-downloads a **~2.6 GB** checkpoint to `~/.cache/torch/hub/checkpoints/`.

**S2 explorer** lives in `web/` (Node 22+, no conda/GPU env). Seed its assets from S1 output first
(git-ignored): `cp samples/output/splats/*.ply samples/output/thumbs/*.jpg web/public/memories/`,
then compress them to the `.sog` the explorer loads (`npm run convert-splats`).

```powershell
cd web
npm install
npm run convert-splats  # .ply -> .sog (compressed web-delivery format) in public/memories/
npm run dev          # dev server (http://localhost:3000) — for iteration only
npm run build        # production build
npm run start        # serve the production build — VERIFY HERE, not dev
npm test             # Vitest unit tests (pure logic; WebGL renderer is the mocked seam)
```

**S4 — Phone Companion + deployment re-architecture (BUILT, unit-tested; GPU/on-phone end-to-end
still to verify on hardware).** The exhibition target is **Architecture A**: everything same-origin
on the ki-pc GPU box behind **Caddy/HTTPS** — a **FastAPI backend** (`backend/`) that **absorbs
`pipeline/` and runs SHARP inline**, plus the **static-exported** frontend. This replaces the Next.js
Route Handlers (deleted) and the `pipeline.watch` watcher (retired; inline reconstruction now).
S4 adds a minimal **`/m` phone page** (`web/src/app/m/`): **Add** (photo + manual-date fallback +
MediaRecorder voice note; `placement=scatter` drops it near the cluster) and **Drive** (touch
joystick — left half moves, right half looks, plus "jump to a memory"). Drive also has a **phone
gyroscope "magic window" look** (default; the touch look-stick is a toggleable fallback): physically
aim the phone to look around while movement stays on the move stick. It rides a **parallel absolute
`aim:{yaw,pitch}` channel** alongside the rate `look`; only *relative* orientation is used (calibrated
against a Recenter baseline captured on the projector, so no reliable absolute compass is needed and
roll is dropped — the horizon stays level). Pure device-math + calibration/smoothing are
unit-tested (`lib/control/{orientation,aim}.ts`); the `deviceorientation` listener + iOS
`requestPermission()` are the sensor seam (`hooks/useDeviceOrientation.ts`). Memories with a voice note
play **spatial audio** on the projector (`MemoryAudio`, distance-attenuated, one-time "enable sound"
gesture). The joystick is a **WebSocket** (`/ws/control`, single-driver token in `backend/control.py`;
projector bridge `lib/control/remoteInput` read by `Navigation`). GitHub Pages is dropped (mic needs HTTPS, the splat renderer
needs COOP/COEP headers Pages can't send, assets are GPU-local). The frontend talks to the backend
via `getApiBaseUrl()` (`web/src/lib/api/baseUrl.ts`) — same-origin in prod, dev proxies `/api` +
`/assets` to `:8000` via `next.config.ts` rewrites. Spec:
`docs/superpowers/specs/2026-06-30-s4-phone-companion-and-ki-pc-deployment-design.md`. Deploy guide:
`deploy/README.md`. Backend pure logic is **pytest-tested** (ports of the former TS `server/**` +
`lib/{geo,upload,exif,manifest}`); SHARP/EXIF/fs/WebSocket are the seams.

```powershell
# Backend (in the `sharp` conda env for real GPU reconstruction)
pip install -r requirements-backend.txt          # fastapi/uvicorn/pillow (one time)
uvicorn backend.app:app --reload --port 8000     # dev; frontend `npm run dev` proxies to it
# Static frontend export for deployment (served by Caddy on ki-pc):
cd web && STATIC_EXPORT=1 npm run build           # -> web/out/   (NEXT_BASE_PATH=/sub for a subpath)
# Tests (.venv): now covers both the pipeline and the FastAPI backend
.\.venv\Scripts\python.exe -m pytest              # tests/ + backend/tests/
```

## Conventions

- **Icons: Untitled UI only.** Every UI icon comes from the **`@untitledui/icons`** package (the free
  line set) as a named, tree-shakeable import — `import { Edit05 } from "@untitledui/icons"`, rendered
  `<Edit05 width="100%" height="100%" />` (size via `width`/`height` or the `size` prop). **Never**
  paste inline `<svg>` icon markup, add another icon library (lucide, react-icons, heroicons…), or use
  emoji/text glyphs (`✓`, `🎙`, `+`) as icons. Find names in the package exports
  (`web/node_modules/@untitledui/icons/dist/index.d.ts`) or at https://www.untitledui.com/free-icons.
  Icons default to `stroke="currentColor"` so they inherit theme color via the CSS-module vars; size
  them to their container. `Gizmo.tsx`'s runtime-generated SVG is a 3D transform control, **not** an
  icon — exempt. Official agent guidance: https://www.untitledui.com/react/AGENT.md
- **TDD, with the un-testable seam isolated.** S1: test the logic we write (command construction,
  thumbnails, manifest, orchestration) with the SHARP subprocess mocked/injected; prove the real
  model with one manual smoke test. S2 mirrors this — pure logic in `web/src/lib/**` is
  Vitest-tested; the WebGL Viewer is the single mocked seam, proven by the manual browser smoke
  test. Don't unit-test the GPU/WebGL.
- **S2 gotchas:** React StrictMode is **disabled** (`web/next.config.ts`) — its dev double-mount
  tore down the splat renderer's WebGL context. Spark's worker sort needs **COOP/COEP** headers for
  SharedArrayBuffer: `next.config.ts` sets them for the **dev server only** (they're ignored by
  `output: export`); in production **Caddy** sets them (`deploy/Caddyfile`). Spark ships its own types and inlines its
  workers (no `.wasm` to host). Verify on a **production build** (`npm run build && npm run start`),
  not dev — HMR remounts the WebGL canvas and throws spurious errors.
- Small, single-responsibility modules in `pipeline/` (`thumbnails`, `sharp_runner`, `manifest`,
  `cli`). Files that change together live together.
- This project follows the **superpowers** workflow: specs live in `docs/superpowers/specs/`, plans
  in `docs/superpowers/plans/`. Brainstorm → spec → plan → implement; commit frequently.
- Splat/binary outputs (`*.ply`, `*.sog`, `*.ksplat`, `outputs/`, `samples/`) are git-ignored — keep
  them local. In `web/`, `node_modules/`, `.next/`, and the seed binaries under `public/memories/`
  (`*.ply`/`*.sog`/`*.jpg`) are ignored; `manifest.json` + READMEs there are tracked.
