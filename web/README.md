# Collective Memory City — Explorer (S2)

The web explorer: a dark-void world you fly through, where each uploaded photo
appears as a photoreal 3D Gaussian-splat "memory" at its place in the city.
Next.js (App Router) + React Three Fiber + `@mkkellogg/gaussian-splats-3d`.

## Prerequisites

- Node 22+
- Splat/thumbnail assets from the S1 pipeline (see seeding below). Until S3 (the
  contribution app) exists, the explorer runs against a hand-authored
  `public/memories/manifest.json`.

## Setup

```bash
cd web
npm install

# Seed the sample assets (git-ignored). From the repo root:
cp ../samples/output/splats/*.ply public/memories/
cp ../samples/output/thumbs/*.jpg public/memories/
```

## Run

```bash
npm run dev      # dev server at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm test         # unit tests (Vitest)
```

> **Verify on a production build.** Dev mode (HMR / Fast Refresh) can remount the
> WebGL viewer mid-load and produce spurious console errors (e.g. a lost context
> or `visitLeaves`). `next build && next start` — the exhibition's actual mode —
> has no HMR and runs clean. React StrictMode is disabled for the same reason
> (the splat canvas is a singleton; production never double-mounts).

## Configuration

`NEXT_PUBLIC_MEMORIES_BASE_URL` (default `/memories`) is the only place that
knows where assets live — point it at a static host / CDN for deployment without
touching code. See `.env.local.example`.

## Controls

- **Click** the canvas to capture the mouse (pointer lock); **Esc** to release.
- **Mouse** to look; **WASD** to fly in the direction you're looking.
- Aim the centre dot at a memory and **click** to travel to it (WASD cancels).

## Architecture

Pure, WebGL-free logic lives in `src/lib/**` and is unit-tested; the WebGL Viewer
is the single mocked seam, proven by the manual smoke test below — mirroring S1's
"isolate the un-testable seam" philosophy.

- `lib/manifest` — parse + validate the explorer manifest; resolve asset URLs.
- `lib/transform` — map a memory's stored transform to renderer args, applying
  the SHARP→three.js (180°-about-X) frame correction. No geo math (that's S3).
- `lib/camera` — fly-to tween, framing, and "look at it and click" picking.
- `lib/lod` — load/dispose decisions (hysteresis) + scene-index bookkeeping.
- `components/` — the R3F canvas (`SplatWorld`), the LOD loader (`Memories`),
  free-fly (`FreeFly`), billboards, starfield, grid, HUD.

## Smoke test (the spec's bar)

> Load 3–5 hand-placed splats; fly + travel; confirm the dark-void renders and is
> smooth.

Run `npm run build && npm run start`, open http://localhost:3000 in a fresh tab:

- [x] Dark-void world renders.
- [x] 5 seed memories load at their hand-placed transforms (upright).
- [x] Free-fly is smooth; click-a-memory smoothly flies the camera to frame it.

### Results

Verified on the RTX 4060 laptop (production build): all 5 seed memories render
upright in the dark void; free-fly + click-to-travel are smooth; no console
errors.

### Deferred for now

- **Auto-LOD** (load/dispose-on-approach + photo billboards). The library's
  dynamic `addSplatScene`/`removeSplatScene` races its async splat-tree build
  (a null `visitLeaves` crash), so all splats are loaded in one batch instead.
  The tested decision logic remains in `lib/lod/` for a future, stable approach.
- **Starfield + procedural grid** — removed by preference; revisit the void
  aesthetic later.
