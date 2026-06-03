# Collective Memory City — Explorer (S2)

The web explorer: a dark-void world you fly through, where each uploaded photo
appears as a photoreal 3D Gaussian-splat "memory" at its place in the city.
Next.js (App Router) + React Three Fiber + [Spark](https://sparkjs.dev)
(`@sparkjsdev/spark`).

Splats are delivered as compressed **SOG** (`.sog`, ~6× smaller than raw `.ply`)
and rendered with **distance residency**: a distant memory shows a cheap
decimated **point-cloud preview** (a `.preview.ply` "ghost") and only resolves
into the full splat once you fly near it, so the scene scales to hundreds of
memories. Spark performs the global splat sort across every resident splat.

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

# Prep the seeded .ply for web delivery (writes alongside, in place): a
# compressed .sog (loaded up close) + a decimated .preview.ply (the distant
# point-cloud ghost). S1 keeps the .ply as archival truth.
npm run convert-splats
```

## Run

```bash
npm run dev      # dev server at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm test         # unit tests (Vitest)
```

> **Verify on a production build.** Dev mode (HMR / Fast Refresh) can remount the
> WebGL canvas mid-load and produce spurious console errors (e.g. a lost
> context). `next build && next start` — the exhibition's actual mode — has no HMR
> and runs clean. React StrictMode is disabled for the same reason (the splat
> canvas is a singleton; production never double-mounts).

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
- `lib/lod` — distance-based load/dispose decisions (`decideLod`, hysteresis) and
  the preview-asset URL derivation (`previewUrlFor`).
- `lib/splat` — `loadPreviewPoints` (fetch + parse a `.preview.ply` into a
  `THREE.Points` cloud via Spark's `PlyReader`).
- `components/` — the R3F canvas (`SplatWorld`), the residency loader
  (`Memories`), free-fly (`FreeFly`), the travel HUD (`TravelOverlay`).

`Memories` owns the per-memory level of detail: it loads a decimated
`THREE.Points` preview for every record, then a throttled per-frame tick runs
`decideLod` against the camera position to create a Spark `SplatMesh` for nearby
memories and `dispose()` distant ones. On load the point cloud **cross-dissolves**
into the splat — a smoothstep fade (`PREVIEW.fadeMs`) advanced every frame that
animates the splat's `opacity` 0→1 against the point cloud's 1→0 — so the memory
resolves into focus rather than popping; on dispose it falls back to the point
cloud. The preview is placed with the same transform as the splat, so the swap is
in place. Spark's `SplatMesh` has a clean `initialized`/`dispose` lifecycle with
no add/remove race, which is what makes this residency safe. Tuning lives in
`config/explorer.ts` (`LOD` radii, `PREVIEW.pointSize`/`fadeMs`,
`RESIDENCY_TICK_MS`); preview point count is set in `scripts/convert-splats.mjs`.

## Smoke test (the spec's bar)

> Load 3–5 hand-placed splats; fly + travel; confirm the dark-void renders and is
> smooth.

Run `npm run build && npm run start`, open http://localhost:3000 in a fresh tab:

- [x] Dark-void world renders.
- [x] Distant memories show as point-cloud ghosts; flying within `loadRadius`
      resolves them into full splats (upright), which dispose again as you leave.
- [x] Free-fly is smooth; click-a-memory smoothly flies the camera to frame it.

### Results

Verified on the RTX 4060 laptop (production build): seed memories render upright
in the dark void; point-cloud previews resolve to splats on approach and dispose
on departure; free-fly + click-to-travel are smooth.

### Performance

The renderer was reworked (Spark + SOG + residency) to scale to hundreds of
memories on the laptop and the exhibition machine alike:

- **SOG delivery** — `npm run convert-splats` turns each ~63 MB SHARP `.ply` into
  a ~10 MB `.sog` (these single-image splats carry 0 SH bands, so there's no
  view-dependent colour to lose) plus a ~220 KB decimated `.preview.ply`.
- **Distance residency** — only memories within `LOD.loadRadius` are resident as
  full splats; the rest are cheap ~4k-point clouds. Bounds VRAM regardless of
  city size.
- **Render tuning** — `dpr` capped at 1.5 and `antialias: false` (MSAA doesn't
  help Gaussian splats and costs fill rate).

### Deferred for now

- **Starfield + procedural grid** — removed by preference; revisit the void
  aesthetic later.
- **Spark's built-in per-splat LOD** (`SplatMesh({ lod })`) — not needed yet;
  our distance residency is the primary lever. Worth evaluating if individual
  resident splats ever become the bottleneck.
