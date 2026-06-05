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

Shared in both the public fly-through and the curator edit mode (`Navigation`):

- **Left-drag** to look/orbit, **right-drag** to pan, **scroll** to zoom.
- **WASD** to fly in the direction you're looking (**Shift** to boost).
- **Double-click** a memory to fly to it (any input cancels mid-flight).
- Edit mode (**E**): **click** a memory to select it, **G/R/S** to move/rotate/scale
  with the gizmo.
- **M** (or the corner button) toggles the faint Wolfsburg **map ground plane**.

## Architecture

Pure, WebGL-free logic lives in `src/lib/**` and is unit-tested; the WebGL Viewer
is the single mocked seam, proven by the manual smoke test below — mirroring S1's
"isolate the un-testable seam" philosophy.

- `lib/manifest` — parse + validate the explorer manifest; resolve asset URLs.
- `lib/transform` — map a memory's stored transform to renderer args, applying
  the SHARP→three.js (180°-about-X) frame correction. No geo math (that's S3).
- `lib/camera` — fly-to tween, framing, and cursor→memory bbox picking
  (`memoryAtPointer`, shared by edit-mode select and fly-mode travel).
- `lib/lod` — distance-based load/dispose decisions (`decideLod`, hysteresis) and
  the preview-asset URL derivation (`previewUrlFor`).
- `lib/splat` — `loadPreviewPoints` (fetch + parse a `.preview.ply` into a
  `THREE.Points` cloud via Spark's `PlyReader`).
- `components/` — the R3F canvas (`SplatWorld`), the residency loader
  (`Memories`), shared navigation (`Navigation` — orbit + WASD fly, both modes),
  double-click travel (`Travel`), the travel HUD (`TravelOverlay`), the in-flight
  placeholder markers (`PendingSpheres` — flat HTML outline rings, not meshes),
  and the faint map ground plane (`MapGround`).
- `lib/map` — the ground-plane pieces: `extent.ts` (span → world plane size +
  lon/lat bbox, mirroring the geo projection; unit-tested), `style.ts` (the
  swappable OSM `StyleSpecification`), and `groundTexture.ts` (the offscreen
  MapLibre→`CanvasTexture` browser seam). Styling is config-only via `MAP` in
  `config/explorer.ts` (opacity/tint/span/resolution); only visibility toggles at
  runtime.

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

## S3 — Contribution flow (drop-to-splat)

The contribution flow lives entirely **inside the explorer** — there are no
separate placement or admin pages. Drop a photo and it becomes a geo-placed splat
on its own; a faint placeholder sphere marks it while reconstruction runs in the
background, and you keep flying. The chosen city is **Wolfsburg** (origin
52.4227, 10.7865, in `config/explorer.ts` `CITY`).

**The lifecycle:**

1. **Drop** (on the explorer) — drop a city photo onto the main view. The server
   saves the original under `data/uploads/`, copies it to the recon inbox
   (`RECON_INBOX`, default `data/inbox/`), parses EXIF, and creates a `processing`
   record with its world `transform` **already computed**: EXIF GPS →
   `geoToTransform` (the real Wolfsburg location); no GPS → a position in front of
   the current camera (the client sends its live pose). No placement step.
2. **Placeholder sphere** — the explorer polls the store (`GET /api/memories`) and
   draws a faint wireframe sphere (`PendingSpheres`) at each in-flight memory's
   position. You can keep exploring existing memories while it reconstructs.
3. **Reconstruct (auto, GPU-side watcher)** — the GPU-side watcher
   (`python -m pipeline.watch`, started by the curator in the conda `sharp` env)
   picks the inbox copy up, reconstructs it, converts it to `.sog`, drops the
   assets into `public/memories/`, and calls the `ingest` API. On error it calls
   the `fail` API and moves the image to `data/inbox/failed/`; re-drop to retry.
   The web process never runs SHARP.
4. **Ingest auto-approves + publishes** — `POST /api/memories/[id]/ingest` flips
   the record to `ready`, then immediately sets `approved` and **republishes**
   `public/memories/manifest.json` (no admin gate). Publish **merges** the store's
   approved records with any hand-authored entries already in the manifest, so
   contributions never wipe curated seed memories. The explorer detects the new
   approval on its next poll, refetches the manifest, the real splat loads, and the
   placeholder sphere drops out.

Fine-tuning placement (heading/scale/position) is done after the fact in the
explorer's **edit mode** (`E` → click a memory → `G/R/S` gizmo → save).

**Data & architecture:**

- State is a single JSON **store** at `data/memories.json` (git-ignored), holding
  the full lifecycle (`uploaded → processing → ready → approved`). The explorer's
  `manifest.json` is published by `server/publish.ts`: `mergeManifest` keeps any
  hand-authored entries (curated seeds, by id) and layers the store's *approved*
  records on top, so S2's strict parser/renderer is never fed in-progress records
  and curated seeds survive each publish.
- **S3 owns the geo math S2 omits.** `lib/geo/project.ts` (equirectangular
  lat/lon → local metres, East=+X / North=−Z), `lib/geo/heading.ts`
  (heading → yaw quaternion, matching the seed convention), and
  `lib/geo/transform.ts` (compose into a `transform`) are pure and unit-tested.
  `lib/upload/placement.ts` (EXIF-GPS-or-camera-front transform) and
  `lib/pending/select.ts` (which records get placeholder spheres) are pure and
  unit-tested too; `lib/exif/placement.ts` normalises exifr output;
  `server/{store,publish,ingest}` hold pure ops behind thin fs seams. **The Route
  Handlers (`app/api/memories/**`) are the seams** — verified manually, not unit
  tested (mirroring S2's WebGL seam).
- **No authentication** — this is a curated, locally-run installation, so the
  contribution routes are intentionally open.

**Config:** `RECON_INBOX` (where uploads are copied for SHARP; point it at S1's
input folder on the exhibition machine) — see `.env.local.example`.

### S3 smoke test (the spec's bar)

> drop → auto-placed (GPS or camera-front) → placeholder sphere → auto-reconstruct
> → auto-publish → appears at the right place.

The **backend** path (drop → ingest → auto-approve → republish) is verified
headlessly against a production build. The **browser** path needs a human:

```bash
npm run build && npm run start   # then open http://localhost:3000
```

- [ ] Drop a Wolfsburg photo onto the explorer (ideally one with GPS). A faint
      pulsing ring marker appears (at the GPS location, or in front of the camera);
      the top-right hint shows "Memory added — reconstructing…". You can keep flying.
- [ ] Start the watcher (`python -m pipeline.watch`) on the GPU box; it
      reconstructs the inbox image and calls `ingest` automatically. (To test the
      flow without a GPU, manually copy an existing seed `.sog`/`.preview.ply`/`.jpg`
      to `public/memories/<id>.*` and `POST` the `ingest` endpoint for that id.)
- [ ] `/` — within a poll cycle the sphere is replaced by the splat at its
      Wolfsburg location. Press **M** to toggle the faint map ground plane.
