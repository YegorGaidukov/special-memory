# Stripped-down explorer + faint map — design

**Date:** 2026-06-04
**Status:** Approved (brainstorm), ready for implementation plan
**Affects:** S2/S3 web app (`web/`) only. S1 pipeline and the Python watcher are unchanged.

## Goal

Collapse the contribution flow into the explorer so the whole experience is one page:
drag a photo onto the explorer and it becomes a geo-placed splat with **no intermediate
pages** (no location-picker, no admin approval). While reconstruction runs in the
background the curator keeps exploring; a faint placeholder sphere marks the new memory
until its splat is ready, then the splat replaces it automatically. Add a barely-visible,
toggleable, config-styled Wolfsburg map as an in-world ground plane.

## Key facts about the current code (verified)

- `/` already contains **both** explore and edit. "Edit" is a **mode** inside the
  explorer (`E` key / "Edit placements" button → `ExplorerEditor` + `Gizmo`), not a
  separate page. This mode stays untouched.
- `/contribute/[id]` is the MapLibre placement page (`PlacementMap` + `MemoryEditor3D`).
  `/admin` is the approve queue. Both are removed.
- The explorer manifest (`public/memories/manifest.json`) holds only `approved` records
  and is fetched **once** by `useManifest` (never refetched). Pending records live in the
  server store and are returned by `GET /api/memories`.
- `geoToTransform(geo, origin, heading_deg, scale)` (`lib/geo/transform`) already turns
  lat/lon + heading + scale into the stored `transform`. The upload route can call it
  directly.
- The lifecycle is `uploaded → processing → ready → approved`; only `approved` is
  published. The Python watcher (`python -m pipeline.watch`) reconstructs a dropped photo,
  runs `convert-splats`, drops `<id>.sog` into `public/memories/`, and calls the `ingest`
  API. The watcher itself does not change.
- `Memories.tsx` drives all splat LOD/residency keyed on a records signature; it is
  reused as-is. The placeholder spheres are a separate, additive renderer.

## Architecture changes

### 1. Pages & routes

- **Keep:** `/` (the explorer, including edit mode). No new pages.
- **Delete:**
  - `web/src/app/contribute/[id]/page.tsx`, `page.module.css`,
    `PlacementMap.tsx`, `PlacementMap.module.css`
  - `web/src/app/admin/page.tsx` (and any admin-only child components it owns)
  - `web/src/components/MemoryEditor3D.tsx` (only used by the contribute page; the
    explorer's `ExplorerEditor` is the editor that stays)
- **API routes:**
  - Keep `POST /api/memories` (upload), `GET /api/memories`, `GET /api/memories/[id]`,
    `POST /api/memories/[id]/ingest`, `POST /api/memories/[id]/fail`,
    `PATCH /api/memories/[id]/transform`.
  - Remove the map-placement `PATCH /api/memories/[id]` handler (lat/lon/heading →
    transform). It was only called by `PlacementMap`'s "Save placement". The `GET` handler
    in that same file stays.
  - The `POST /api/memories/[id]/approve` route is removed; its publish behavior folds
    into `ingest` (see §4). Keep the `publishManifest` helper.

### 2. Drop → auto-placement (no navigation)

`DropToContribute` no longer calls `router.push`. On a successful drop it shows a small
non-blocking toast ("Reconstructing '<name>'…") and the curator stays on the explorer.

`POST /api/memories` computes the `transform` immediately instead of storing a placeholder
identity transform:

- **EXIF GPS present:** `geoToTransform(geo, ORIGIN, heading=0, scale=1)`. The sphere (and
  later the splat) appears at the real Wolfsburg location. `ORIGIN` = `CITY.origin_*`.
- **No EXIF GPS:** the client sends the current **camera-front** world position
  (`camera_position + camera_forward * FLY_TO_STANDOFF`). The route stores that as
  `transform.position`, identity quaternion `[0,0,0,1]`, scale `[1,1,1]`.

Getting the live camera pose to the (DOM, outside-`Canvas`) drop handler:

- A new tiny in-`Canvas` component `CameraPoseProbe` writes the camera's world position +
  forward vector to a module-level mutable ref (`lib/camera/pose.ts`) every frame.
- `DropToContribute` reads that ref on drop and includes
  `camera_position: [x,y,z]` and `camera_forward: [x,y,z]` in the multipart form (as JSON
  string fields). The upload route uses them only when EXIF GPS is absent.

Status still starts as `processing` (the inbox copy + watcher are unchanged).

### 3. Placeholder spheres + live appearance (Approach A)

- New hook `usePendingMemories` polls `GET /api/memories` every ~3s and returns records
  whose status is `processing` or `ready`.
- New scene component `PendingSpheres` renders a faint, glowing, translucent **wireframe**
  sphere at each pending record's `transform.position` (radius ≈ `FLY_TO_STANDOFF`).
  Visual-only; additive to the existing `Memories` renderer.
- Pure selection logic — "records that are pending and not yet present in the loaded
  manifest" — lives in `lib/pending/select.ts` and is unit-tested. Sphere meshes are the
  manual/visual seam.
- When the poll detects a record transitioning into `approved` (i.e. a pending id that has
  left the pending set / appeared in the store as approved), it bumps a refetch counter.
  `useManifest` gains a `refetch()`/version input so it re-fetches the manifest. The newly
  approved splat loads through the existing LOD pipeline; because it is now in the manifest
  it is no longer "pending", so its sphere is dropped.
- Free-fly is unaffected: pointer-lock blocks OS file-drop events (so dropping naturally
  requires exiting flight), but the poll + sphere render continue while flying.

### 4. Auto-approve + publish (no admin gate)

`POST /api/memories/[id]/ingest`: after `ingestFromDisk` returns a `ready` patch, the route
also sets `status: "approved"` and calls `publishManifest(next, city)` before responding.
A single watcher callback now takes a memory all the way from `processing` to visible in
the explorer. The contribution flow is intentionally open (no auth) — consistent with the
existing curated/local-install decision.

### 5. Faint Wolfsburg map ground plane

- New scene component `MapGround` renders an **offscreen** MapLibre map (reusing the
  existing key-free OSM raster `StyleSpecification`) into a `THREE.CanvasTexture`, applied
  to a large horizontal plane at ground level. Built **once** (static texture); the map is
  not interactive.
- Alignment: the plane covers a geographic bbox centered on `CITY.origin`. Its world
  extent and center come from projecting the bbox corners through the **same**
  equirectangular projection memories use (`lib/geo/project`), so streets sit under their
  real memories. The bbox↔world-extent math is pure and unit-tested (`lib/map/extent.ts`).
- Faint by default; **styling is config-driven** (no in-app restyle UI). In
  `config/explorer.ts`:

  ```ts
  export const MAP = {
    enabled: true,
    style: OSM_STYLE,     // swappable MapLibre StyleSpecification
    spanMeters: 4000,     // ground extent (square) around origin
    textureSize: 2048,    // offscreen render resolution (px)
    opacity: 0.18,        // "barely visible"
    tint: "#3a4a66",      // material color multiply
    y: 0,                 // ground height
  } as const;
  ```

  `OSM_STYLE` moves from `PlacementMap` into a shared module (e.g. `lib/map/style.ts`) so
  both the (removed) placement map history and the ground plane reference one definition;
  after `PlacementMap` is deleted it lives only here.
- **Hide/show** at runtime: an `M` key toggle plus a small corner button. Visibility only —
  all *styling* changes go through `MAP` config, per the chosen approach.

### 6. Data contract

No change to the `MemoryRecord` / `ContribRecord` shape. The only behavioral changes are
*when* the transform is computed (on upload, not on a later placement step) and *when*
publish happens (on ingest, not on a separate approve step).

## Testing

- **Unit (Vitest):**
  - `lib/pending/select.ts` — pending-vs-published selection.
  - upload camera-front placement math (camera pos + forward × standoff → position).
  - `lib/map/extent.ts` — bbox → world plane extent/center via the shared projection.
- **Update** the headless backend smoke test: ingest now auto-approves + publishes, so the
  flow is upload → (watcher) ingest → published; the separate approve step is gone.
- **Manual seams (unchanged discipline):** the WebGL placeholder spheres, the
  MapLibre→texture ground plane, and the route handlers. Verify on a **production build**
  (`npm run build && npm run start`), not dev.

## Out of scope (YAGNI)

- No settings panel or live restyle controls (config only).
- No corner minimap (ground plane only).
- No SSE/WebSocket push (polling only).
- No per-memory heading picker on upload — fine-tuning is what edit mode is for.
- No auth on the contribution flow (unchanged decision).

## Migration / cleanup notes

- Delete the orphaned files in §1 and any imports/links to `/contribute` and `/admin`
  (e.g. the `done` toast in the old contribute page, links in HUD/overlays if any).
- Remove tests that target the deleted map-placement `PATCH` route and the `/admin` page;
  keep/adjust tests for `ingest` (now auto-publishing).
- Confirm no remaining references to `MemoryEditor3D` or `PlacementMap` after deletion.
