# S3 — Contribution Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the contribution subsystem to the `web/` app: a curator uploads a city photo, EXIF auto-places it on a MapLibre map (draggable pin + rotatable facing-arrow + scale nudge), the app computes the memory's world `transform`, the photo is queued for SHARP reconstruction, and an approve flag publishes it into the explorer's manifest so it appears in the dark-void world.

**Architecture:** S3 owns the geo math the explorer deliberately does not (`lat/lon + heading → transform{position, quaternion, scale}`). A server-side JSON **store** (`web/data/memories.json`) holds the full record lifecycle (`uploaded → processing → ready → approved`); a pure **publish** step projects the approved subset into the explorer's existing `public/memories/manifest.json`, leaving the verified S2 renderer and its strict parser untouched. Next.js 16 Route Handlers expose upload/placement/ingest/approve; thin client pages drive them. Every un-testable boundary (filesystem, `exifr` binary parse, MapLibre GL canvas) is isolated behind a seam — all geo/store/publish/exif-normalize/auth logic is pure and Vitest-tested, mirroring S1's `sharp_runner` and S2's WebGL-seam philosophy.

**Tech Stack:** Next.js 16.2.7 (App Router Route Handlers, `runtime = 'nodejs'`), React 19, TypeScript, `exifr` (EXIF/GPS parse), `maplibre-gl` (placement map, no API key — OSM raster tiles), Vitest. The GPU (SHARP) stays entirely out of the web process — the bridge is the filesystem.

> **SCOPE CHANGE (2026-06-03, per user direction): authentication is removed.** This is a curated,
> locally-run installation, so the contribution/admin routes and pages are **open** — no curator
> password, no login route, no route guards. The following are dropped from this plan: **Task 8**
> (auth module) — removed; **Task 14** (login route) — now just the backend smoke test; the
> `isAuthed` guards in Tasks 11–13; the `CURATOR_PASSWORD` env var (Task 10); the password gate
> (Task 15) and the "Locked" handling (Task 18). The `src/server/auth.ts` and `src/app/api/login`
> entries below no longer apply.

---

## Context

This is subsystem **S3** of Collective Memory City (spec:
`docs/superpowers/specs/2026-06-02-collective-memory-city-design.md`, S3 section lines 64–71). S1
(Python reconstruction) and S2 (web explorer) are both built and verified. S3 is the human-facing
front door that feeds S2.

**The city is Wolfsburg, Germany.** Origin (city centre / Rathaus): **`origin_lat = 52.4227`,
`origin_lon = 10.7865`**. These go into the manifest's `city` block and the geo projection.

### Key facts discovered in the codebase (read these before starting)

- **The explorer reads `web/public/memories/manifest.json`** via `useManifest()` →
  `parseManifest()` (`web/src/lib/manifest/parse.ts`). That parser calls `parseMemory()` on **every**
  record *before* filtering by status, and `parseMemory` **throws** if `transform`/`splat_url` are
  missing or malformed. **Therefore in-progress uploads must NOT live in that file.** S3 keeps its
  own full store and publishes only renderable records into the explorer manifest. This keeps the
  verified S2 untouched.
- **The explorer's renderable statuses are `ready` and `approved`** (`parse.ts` `RENDERABLE_STATUSES`).
  S3 uses the full lifecycle `uploaded | processing | ready | failed | approved`. We publish only
  `approved` (curated gate per the spec's "approve flag").
- **The memory record contract** (`web/src/lib/manifest/types.ts`): `id, status, thumbnail_url,
  splat_url, transform{position:Vec3, quaternion:Quat, scale:Vec3|number}` required; `geo{lat,lon},
  heading_deg, captured_at, created_at` optional. S3 records add a server-only `source_image`.
- **Geo math is unowned and is S3's job.** `web/src/lib/transform/apply.ts` only applies the
  SHARP→three.js 180°-about-X correction (`SHARP_TO_THREE = [1,0,0,0]`) and is a *pure pass-through*
  of the stored `transform`. CLAUDE.md: "S2 does no geo math — it only reads stored transforms."
- **Heading→quaternion convention is already fixed by the seed manifest.** In the current
  hand-authored `public/memories/manifest.json`, `heading_deg: 45 → quaternion [0, 0.38268, 0,
  0.92388]` and `heading_deg: 90 → [0, 0.70711, 0, 0.70711]`. That is exactly
  `[0, sin(θ/2), 0, cos(θ/2)]` with θ = heading in radians (yaw about +Y = heading). **S3 must match
  this** so generated records align with existing seed placements. (The sign is a visual-convention
  detail, locked to the seed data and re-verified in the smoke test, just as `SHARP_TO_THREE` was.)
- **`@/*` → `web/src/*`** (tsconfig + vitest alias). Server code lives in `web/src/server/**`, pure
  shared logic in `web/src/lib/**`. Tests live in `web/test/*.test.ts` (Vitest `node` env, include
  `test/**/*.test.ts`).
- **Next.js 16 Route Handlers** (verified from `node_modules/next/dist/docs`): `app/api/.../route.ts`
  exporting `async GET/POST/PATCH`; **`context.params` is a `Promise`** (await it) and can be typed
  with the global `RouteContext<'/api/...'>`; read uploads with `await request.formData()` →
  `formData.get('photo')` (a `File`/`Blob`); cookies via `await cookies()` from `next/headers`. Add
  `export const runtime = 'nodejs'` to any handler that touches `fs`.

### World/geo conventions (LOCK THESE — the crux of S3)

- three.js world, **Y-up**, ground plane = **XZ**, `y = 0` for all memories.
- **East = +X. North = −Z.** (Looking down −Z is "north/forward".)
- Equirectangular projection about `(origin_lat, origin_lon)`:
  - `M_PER_DEG_LAT = 111_320`
  - `mPerDegLon = 111_320 * cos(origin_lat · π/180)`
  - `x = (lon − origin_lon) · mPerDegLon`   (east positive)
  - `z = −(lat − origin_lat) · M_PER_DEG_LAT`  (north → −Z)
- **Heading** = degrees clockwise from north (compass). Quaternion = yaw about +Y:
  `headingToQuaternion(θ_deg) = [0, sin(rad/2), 0, cos(rad/2)]`, `rad = θ_deg · π/180`. Matches seed
  data (heading 0 → identity `[0,0,0,1]`).
- `scale` defaults to `[1,1,1]` (SHARP is metric); the placement UI offers a nudge multiplier.

### Data flow (filesystem is the GPU bridge — web process never calls SHARP)

```
contributor → POST /api/memories (photo) ─┐
                                          ├─ save original → web/data/uploads/<id>.<ext>
                                          ├─ copy → RECON_INBOX/<id>.<ext>   (S1 picks this up)
                                          └─ exifr parse → record{status:uploaded, geo?, captured_at?}
curator → /contribute/<id> (MapLibre)  → PATCH /api/memories/<id> (geo,heading,scale)
                                          └─ geoToTransform(...) → record.transform, status stays
curator runs S1 MANUALLY on the GPU box: python -m pipeline -i RECON_INBOX -o out ; npm run convert-splats
   then drops <id>.sog + <id>.preview.ply + <id>.jpg into web/public/memories/
curator → POST /api/memories/<id>/ingest → scan public/memories for <id>.sog → status:ready, set urls
curator → /admin → POST /api/memories/<id>/approve → status:approved + publish() rewrites manifest.json
explorer → reads public/memories/manifest.json → memory appears at its real Wolfsburg location
```

This honours the spec's "Manual/CLI trigger is acceptable for MVP" and keeps the web app runnable on
any machine (the GPU only matters when the curator runs S1).

## File Structure

All paths relative to `web/` unless noted. New files grouped by responsibility.

**Pure shared logic (`src/lib/`, Vitest-tested):**
- Create: `src/lib/geo/project.ts` — `projectToLocal(geo, origin)` equirectangular → `[x,0,z]`.
- Create: `src/lib/geo/heading.ts` — `headingToQuaternion(deg)` yaw-about-Y.
- Create: `src/lib/geo/transform.ts` — `geoToTransform(geo, origin, heading_deg, scale)` → `Transform`.
- Create: `src/lib/exif/placement.ts` — `extractPlacement(parsedExif)` → `{lat?,lon?,captured_at?}` (pure).

**Server logic (`src/server/`, pure parts Vitest-tested; fs/exifr behind seams):**
- Create: `src/server/types.ts` — `ContribRecord`, `ContribStore`.
- Create: `src/server/store.ts` — pure record ops (`addRecord`, `updateRecord`, `findById`) + fs seam (`loadStore`, `saveStore`, `STORE_PATH`).
- Create: `src/server/publish.ts` — `toExplorerManifest(store, city)` pure + `publishManifest()` fs seam.
- ~~Create: `src/server/auth.ts`~~ — **REMOVED (auth dropped).**
- Create: `src/server/paths.ts` — resolved dirs (`UPLOADS_DIR`, `RECON_INBOX`, `PUBLIC_MEMORIES_DIR`) from env with defaults.
- Create: `src/server/exif.ts` — `parseExifFromBuffer(buf)` thin `exifr` seam (returns raw → fed to `extractPlacement`).
- Create: `src/server/ingest.ts` — `findSplatAssets(dir, id)` pure (which filenames to expect) + fs glob seam.

**Route Handlers (`src/app/api/`):**
- ~~Create: `src/app/api/login/route.ts`~~ — **REMOVED (auth dropped).**
- Create: `src/app/api/memories/route.ts` — GET (list) + POST (upload).
- Create: `src/app/api/memories/[id]/route.ts` — GET one + PATCH placement.
- Create: `src/app/api/memories/[id]/ingest/route.ts` — POST scan-and-attach splat.
- Create: `src/app/api/memories/[id]/approve/route.ts` — POST approve + publish.

**Client pages (`src/app/`, thin UI over the API; MapLibre is the mocked-in-prod seam):**
- Create: `src/app/contribute/page.tsx` — upload form (drag a photo).
- Create: `src/app/contribute/[id]/PlacementMap.tsx` — MapLibre pin + facing-arrow + scale (client).
- Create: `src/app/contribute/[id]/page.tsx` — loads record, renders `PlacementMap`, saves.
- Create: `src/app/admin/page.tsx` — review queue: list, ingest, approve.

**Config / deps / docs:**
- Modify: `package.json` — add `exifr`, `maplibre-gl`, `@types/...` as needed.
- Modify: `src/config/explorer.ts` — export `CITY` (Wolfsburg name + origin) constant reused by S3.
- Modify: `public/memories/manifest.json` — set real Wolfsburg `city` block.
- Modify: `.gitignore` — ignore `/data/` (store + uploads) but keep `data/.gitkeep`.
- Create: `data/.gitkeep` — so the store dir exists in a fresh checkout.
- Create: `.env.local.example` (or modify if present) — `RECON_INBOX`.
- Modify: `README.md` — S3 section (setup, flow, smoke test).
- Modify (repo root): `CLAUDE.md` — mark S3 built.

Tests (`test/`): `geo.project.test.ts`, `geo.heading.test.ts`, `geo.transform.test.ts`,
`exif.placement.test.ts`, `server.store.test.ts`, `server.publish.test.ts`,
`server.ingest.test.ts`.

---

# Phase 1 — Geo + data foundation (pure, fully tested, no framework)

This phase ships the logic S3 owns and can be exercised entirely by Vitest. No UI, no routes yet.

## Task 1: City config constant

**Files:**
- Modify: `web/src/config/explorer.ts`
- Modify: `web/public/memories/manifest.json`

- [ ] **Step 1: Add the `CITY` constant**

Append to `web/src/config/explorer.ts`:

```ts
// The one chosen city. Origin is Wolfsburg city centre (Rathaus); geo placement
// (S3) projects each memory's lat/lon to local metres relative to this point.
// Shared by the contribution flow and written into the explorer manifest.
export const CITY = {
  name: "Wolfsburg",
  origin_lat: 52.4227,
  origin_lon: 10.7865,
} as const;
```

- [ ] **Step 2: Point the seed manifest at Wolfsburg**

In `web/public/memories/manifest.json`, replace the `city` block:

```json
  "city": {
    "name": "Wolfsburg",
    "origin_lat": 52.4227,
    "origin_lon": 10.7865
  },
```

(Leave the existing demo `memories` array untouched — S3 will republish it later.)

- [ ] **Step 3: Verify the app still parses the manifest**

Run: `cd web && npm test`
Expected: existing suite still PASSES (no test asserts the old `Demo City` name).

- [ ] **Step 4: Commit**

```bash
git add web/src/config/explorer.ts web/public/memories/manifest.json
git commit -m "feat(s3): set city to Wolfsburg (config + manifest origin)"
```

## Task 2: Equirectangular geo projection

**Files:**
- Create: `web/src/lib/geo/project.ts`
- Test: `web/test/geo.project.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/test/geo.project.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectToLocal } from "@/lib/geo/project";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("projectToLocal", () => {
  it("maps the origin to the world origin", () => {
    expect(projectToLocal(ORIGIN, ORIGIN)).toEqual([0, 0, 0]);
  });

  it("keeps memories on the ground plane (y = 0)", () => {
    expect(projectToLocal({ lat: 52.43, lon: 10.79 }, ORIGIN)[1]).toBe(0);
  });

  it("puts a point east of origin at +X", () => {
    const [x] = projectToLocal({ lat: ORIGIN.lat, lon: ORIGIN.lon + 0.01 }, ORIGIN);
    expect(x).toBeGreaterThan(0);
  });

  it("puts a point north of origin at -Z", () => {
    const [, , z] = projectToLocal({ lat: ORIGIN.lat + 0.01, lon: ORIGIN.lon }, ORIGIN);
    expect(z).toBeLessThan(0);
  });

  it("uses ~111320 m per degree latitude", () => {
    const [, , z] = projectToLocal({ lat: ORIGIN.lat + 1, lon: ORIGIN.lon }, ORIGIN);
    expect(-z).toBeCloseTo(111320, 0);
  });

  it("shrinks longitude metres by cos(latitude)", () => {
    const [x] = projectToLocal({ lat: ORIGIN.lat, lon: ORIGIN.lon + 1 }, ORIGIN);
    const expected = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
    expect(x).toBeCloseTo(expected, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run test/geo.project.test.ts`
Expected: FAIL — cannot find module `@/lib/geo/project`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/lib/geo/project.ts`:

```ts
import type { Geo, Vec3 } from "@/lib/manifest/types";

// Metres per degree of latitude (roughly constant on a sphere). Longitude metres
// scale by cos(latitude). Equirectangular approximation is accurate enough at
// city extent (the spec's chosen method).
const M_PER_DEG_LAT = 111_320;

/**
 * Project a memory's lat/lon to local world metres relative to the city origin.
 * three.js frame: East = +X, North = -Z, ground plane y = 0.
 */
export function projectToLocal(geo: Geo, origin: Geo): Vec3 {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  const x = (geo.lon - origin.lon) * mPerDegLon;
  const z = -(geo.lat - origin.lat) * M_PER_DEG_LAT;
  return [x, 0, z];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run test/geo.project.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/geo/project.ts web/test/geo.project.test.ts
git commit -m "feat(s3): equirectangular geo projection (lat/lon -> local metres)"
```

## Task 3: Heading → quaternion

**Files:**
- Create: `web/src/lib/geo/heading.ts`
- Test: `web/test/geo.heading.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/test/geo.heading.test.ts`. Expected values are locked to the seed manifest
(`heading_deg 45 → [0,0.38268,0,0.92388]`, `90 → [0,0.70711,0,0.70711]`):

```ts
import { describe, it, expect } from "vitest";
import { headingToQuaternion } from "@/lib/geo/heading";

describe("headingToQuaternion", () => {
  it("maps heading 0 to the identity quaternion", () => {
    const q = headingToQuaternion(0);
    expect(q[0]).toBeCloseTo(0, 6);
    expect(q[1]).toBeCloseTo(0, 6);
    expect(q[2]).toBeCloseTo(0, 6);
    expect(q[3]).toBeCloseTo(1, 6);
  });

  it("matches the seed manifest for heading 45", () => {
    const [x, y, z, w] = headingToQuaternion(45);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0.38268343, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(w).toBeCloseTo(0.92387953, 6);
  });

  it("matches the seed manifest for heading 90", () => {
    const [, y, , w] = headingToQuaternion(90);
    expect(y).toBeCloseTo(0.70710678, 6);
    expect(w).toBeCloseTo(0.70710678, 6);
  });

  it("returns a unit quaternion", () => {
    const [x, y, z, w] = headingToQuaternion(123);
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 6);
  });

  it("only rotates about Y (x and z stay 0)", () => {
    const [x, , z] = headingToQuaternion(-45);
    expect(x).toBe(0);
    expect(z).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run test/geo.heading.test.ts`
Expected: FAIL — cannot find module `@/lib/geo/heading`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/lib/geo/heading.ts`:

```ts
import type { Quat } from "@/lib/manifest/types";

/**
 * Contributor facing-arrow heading (degrees) → world orientation quaternion.
 * Yaw about +Y by the heading angle: [0, sin(rad/2), 0, cos(rad/2)]. The sign
 * convention is locked to the seed manifest (heading 45 → [0,0.38268,0,0.92388])
 * and re-verified visually in the smoke test, just like the SHARP→three frame
 * correction. This is the memory's WORLD orientation; the renderer composes it
 * with the SHARP→three.js correction in lib/transform/apply.ts.
 */
export function headingToQuaternion(headingDeg: number): Quat {
  const half = (headingDeg * Math.PI) / 180 / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run test/geo.heading.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/geo/heading.ts web/test/geo.heading.test.ts
git commit -m "feat(s3): heading -> yaw quaternion (matches seed convention)"
```

## Task 4: Compose geo + heading → transform

**Files:**
- Create: `web/src/lib/geo/transform.ts`
- Test: `web/test/geo.transform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/test/geo.transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { geoToTransform } from "@/lib/geo/transform";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("geoToTransform", () => {
  it("places a memory at the origin with default scale and identity yaw", () => {
    const t = geoToTransform(ORIGIN, ORIGIN, 0);
    expect(t.position).toEqual([0, 0, 0]);
    expect(t.quaternion[3]).toBeCloseTo(1, 6);
    expect(t.scale).toEqual([1, 1, 1]);
  });

  it("uses the projected position", () => {
    const t = geoToTransform({ lat: ORIGIN.lat, lon: ORIGIN.lon + 0.01 }, ORIGIN, 0);
    expect(t.position[0]).toBeGreaterThan(0);
    expect(t.position[1]).toBe(0);
  });

  it("applies the heading to the quaternion", () => {
    const t = geoToTransform(ORIGIN, ORIGIN, 90);
    expect(t.quaternion[1]).toBeCloseTo(0.70710678, 6);
  });

  it("expands a scalar scale nudge into a 3-vector", () => {
    expect(geoToTransform(ORIGIN, ORIGIN, 0, 1.5).scale).toEqual([1.5, 1.5, 1.5]);
  });

  it("defaults scale to 1 when omitted", () => {
    expect(geoToTransform(ORIGIN, ORIGIN, 0).scale).toEqual([1, 1, 1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run test/geo.transform.test.ts`
Expected: FAIL — cannot find module `@/lib/geo/transform`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/lib/geo/transform.ts`:

```ts
import type { Geo, Transform } from "@/lib/manifest/types";
import { projectToLocal } from "./project";
import { headingToQuaternion } from "./heading";

/**
 * The geo math S2 deliberately doesn't do: turn a memory's real-world placement
 * (lat/lon + contributor heading + optional scale nudge) into the stored
 * `transform` the explorer reads verbatim. SHARP's metric scale means the
 * default scale is 1; the nudge is a multiplier for taste.
 */
export function geoToTransform(
  geo: Geo,
  origin: Geo,
  headingDeg: number,
  scale: number = 1,
): Transform {
  return {
    position: projectToLocal(geo, origin),
    quaternion: headingToQuaternion(headingDeg),
    scale: [scale, scale, scale],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run test/geo.transform.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/geo/transform.ts web/test/geo.transform.test.ts
git commit -m "feat(s3): compose geo+heading+scale -> memory transform"
```

## Task 5: EXIF placement extraction (pure normalization)

The binary parse (`exifr.parse(buffer)`) is the un-testable seam (added in Task 11). This task is the
**pure normalizer**: given an already-parsed EXIF object, produce the placement fields. `exifr`
yields decimal `latitude`/`longitude` and a `DateTimeOriginal` Date.

**Files:**
- Create: `web/src/lib/exif/placement.ts`
- Test: `web/test/exif.placement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/test/exif.placement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractPlacement } from "@/lib/exif/placement";

describe("extractPlacement", () => {
  it("pulls decimal lat/lon from exifr output", () => {
    const p = extractPlacement({ latitude: 52.42, longitude: 10.78 });
    expect(p.geo).toEqual({ lat: 52.42, lon: 10.78 });
  });

  it("returns no geo when GPS is absent (messaging-app exports strip it)", () => {
    const p = extractPlacement({ Make: "Apple" });
    expect(p.geo).toBeUndefined();
  });

  it("returns no geo when only one coordinate is present", () => {
    expect(extractPlacement({ latitude: 52.42 }).geo).toBeUndefined();
  });

  it("ignores non-finite coordinates", () => {
    expect(extractPlacement({ latitude: NaN, longitude: 10 }).geo).toBeUndefined();
  });

  it("formats DateTimeOriginal as an ISO capture time", () => {
    const when = new Date("2026-06-02T21:59:01Z");
    expect(extractPlacement({ DateTimeOriginal: when }).captured_at).toBe(
      "2026-06-02T21:59:01.000Z",
    );
  });

  it("falls back to no capture time when the date is missing or invalid", () => {
    expect(extractPlacement({}).captured_at).toBeUndefined();
    expect(extractPlacement({ DateTimeOriginal: "not a date" }).captured_at).toBeUndefined();
  });

  it("returns an empty placement for null/garbage input", () => {
    expect(extractPlacement(null)).toEqual({});
    expect(extractPlacement(undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run test/exif.placement.test.ts`
Expected: FAIL — cannot find module `@/lib/exif/placement`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/lib/exif/placement.ts`:

```ts
import type { Geo } from "@/lib/manifest/types";

export interface ExifPlacement {
  geo?: Geo;
  captured_at?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Normalize an exifr-parsed object into the placement fields S3 stores. exifr
 * already yields decimal `latitude`/`longitude` and a `DateTimeOriginal` Date.
 * GPS is optional — messaging-app exports strip it, so absence is normal, not an
 * error (the curator then places the pin manually on the map).
 */
export function extractPlacement(raw: unknown): ExifPlacement {
  if (typeof raw !== "object" || raw === null) return {};
  const exif = raw as Record<string, unknown>;
  const placement: ExifPlacement = {};

  if (isFiniteNumber(exif.latitude) && isFiniteNumber(exif.longitude)) {
    placement.geo = { lat: exif.latitude, lon: exif.longitude };
  }

  const when = exif.DateTimeOriginal;
  if (when instanceof Date && !Number.isNaN(when.getTime())) {
    placement.captured_at = when.toISOString();
  }

  return placement;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run test/exif.placement.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/exif/placement.ts web/test/exif.placement.test.ts
git commit -m "feat(s3): pure EXIF placement normalizer (geo + capture time)"
```

## Task 6: Server record types + store (pure ops + fs seam)

**Files:**
- Create: `web/src/server/types.ts`
- Create: `web/src/server/store.ts`
- Test: `web/test/server.store.test.ts`

- [ ] **Step 1: Write the failing test** (pure ops only; fs `loadStore/saveStore` are the seam, smoke-tested by the routes)

Create `web/test/server.store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { addRecord, updateRecord, findById, emptyStore } from "@/server/store";
import type { ContribRecord } from "@/server/types";

function rec(id: string): ContribRecord {
  return {
    id,
    status: "uploaded",
    source_image: `${id}.jpg`,
    thumbnail_url: "",
    splat_url: "",
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    created_at: "2026-06-03T00:00:00.000Z",
  };
}

describe("store ops", () => {
  it("emptyStore has no records", () => {
    expect(emptyStore().records).toEqual([]);
  });

  it("addRecord appends immutably", () => {
    const s0 = emptyStore();
    const s1 = addRecord(s0, rec("a"));
    expect(s1.records).toHaveLength(1);
    expect(s0.records).toHaveLength(0); // original untouched
  });

  it("findById returns the record or undefined", () => {
    const s = addRecord(emptyStore(), rec("a"));
    expect(findById(s, "a")?.id).toBe("a");
    expect(findById(s, "missing")).toBeUndefined();
  });

  it("updateRecord patches a single record by id", () => {
    const s = addRecord(emptyStore(), rec("a"));
    const s2 = updateRecord(s, "a", { status: "ready", splat_url: "a.sog" });
    expect(findById(s2, "a")?.status).toBe("ready");
    expect(findById(s2, "a")?.splat_url).toBe("a.sog");
  });

  it("updateRecord is a no-op for an unknown id", () => {
    const s = addRecord(emptyStore(), rec("a"));
    expect(updateRecord(s, "missing", { status: "failed" })).toEqual(s);
  });

  it("updateRecord does not mutate the input store", () => {
    const s = addRecord(emptyStore(), rec("a"));
    updateRecord(s, "a", { status: "approved" });
    expect(findById(s, "a")?.status).toBe("uploaded");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run test/server.store.test.ts`
Expected: FAIL — cannot find module `@/server/store`.

- [ ] **Step 3: Write the types**

Create `web/src/server/types.ts`:

```ts
import type { MemoryRecord } from "@/lib/manifest/types";

/**
 * The full contribution record. Extends the explorer's MemoryRecord with the
 * server-only original-image filename. Unlike the explorer (which only ever sees
 * renderable records), the store holds every lifecycle state.
 */
export interface ContribRecord extends MemoryRecord {
  /** Filename of the stored original under UPLOADS_DIR (provenance + re-runs). */
  source_image: string;
}

export interface ContribStore {
  records: ContribRecord[];
}
```

- [ ] **Step 4: Write the store**

Create `web/src/server/store.ts`:

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ContribRecord, ContribStore } from "./types";

// The store is a single JSON file under web/data/ (git-ignored). One file is
// enough at this scale (tens–hundreds of memories) per the spec's "SQLite or a
// JSON file". Pure ops below are unit-tested; load/save are the fs seam.
export const STORE_PATH =
  process.env.MEMORIES_STORE_PATH ?? join(process.cwd(), "data", "memories.json");

export function emptyStore(): ContribStore {
  return { records: [] };
}

export function findById(store: ContribStore, id: string): ContribRecord | undefined {
  return store.records.find((r) => r.id === id);
}

export function addRecord(store: ContribStore, record: ContribRecord): ContribStore {
  return { records: [...store.records, record] };
}

export function updateRecord(
  store: ContribStore,
  id: string,
  patch: Partial<ContribRecord>,
): ContribStore {
  return {
    records: store.records.map((r) => (r.id === id ? { ...r, ...patch, id: r.id } : r)),
  };
}

/** fs seam: read the store, tolerating a missing file (first run → empty). */
export async function loadStore(path: string = STORE_PATH): Promise<ContribStore> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ContribStore;
    return Array.isArray(parsed.records) ? parsed : emptyStore();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw err;
  }
}

/** fs seam: write the store, creating web/data/ if needed. */
export async function saveStore(store: ContribStore, path: string = STORE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && npx vitest run test/server.store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/server/types.ts web/src/server/store.ts web/test/server.store.test.ts
git commit -m "feat(s3): contribution record store (pure ops + json fs seam)"
```

## Task 7: Publish — project the store into the explorer manifest

**Files:**
- Create: `web/src/server/publish.ts`
- Test: `web/test/server.publish.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/test/server.publish.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toExplorerManifest } from "@/server/publish";
import { parseManifest } from "@/lib/manifest/parse";
import type { ContribStore, ContribRecord } from "@/server/types";

const CITY = { name: "Wolfsburg", origin_lat: 52.4227, origin_lon: 10.7865 };

function rec(id: string, over: Partial<ContribRecord> = {}): ContribRecord {
  return {
    id,
    status: "approved",
    source_image: `${id}.jpg`,
    thumbnail_url: `${id}.jpg`,
    splat_url: `${id}.sog`,
    transform: { position: [1, 0, 2], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    created_at: "2026-06-03T00:00:00.000Z",
    ...over,
  };
}

describe("toExplorerManifest", () => {
  it("includes the city block", () => {
    const store: ContribStore = { records: [] };
    expect(toExplorerManifest(store, CITY).city).toEqual(CITY);
  });

  it("publishes only approved records", () => {
    const store: ContribStore = {
      records: [
        rec("a", { status: "approved" }),
        rec("b", { status: "ready" }),
        rec("c", { status: "uploaded", splat_url: "" }),
        rec("d", { status: "processing", splat_url: "" }),
      ],
    };
    const ids = toExplorerManifest(store, CITY).memories.map((m) => m.id);
    expect(ids).toEqual(["a"]);
  });

  it("drops the server-only source_image field", () => {
    const store: ContribStore = { records: [rec("a")] };
    const m = toExplorerManifest(store, CITY).memories[0] as Record<string, unknown>;
    expect("source_image" in m).toBe(false);
  });

  it("produces a manifest the explorer's strict parser accepts", () => {
    const store: ContribStore = { records: [rec("a"), rec("b", { status: "uploaded" })] };
    const manifest = toExplorerManifest(store, CITY);
    // parseManifest throws on malformed records; round-tripping proves validity.
    const reparsed = parseManifest(JSON.parse(JSON.stringify(manifest)));
    expect(reparsed.memories.map((m) => m.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run test/server.publish.test.ts`
Expected: FAIL — cannot find module `@/server/publish`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/server/publish.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CityConfig,
  ExplorerManifest,
  MemoryRecord,
} from "@/lib/manifest/types";
import type { ContribStore } from "./types";
import { PUBLIC_MEMORIES_DIR } from "./paths";

// Curated gate: only approved memories reach the explorer (the spec's "approve
// flag"). Server-only fields are stripped so the published manifest matches the
// explorer's contract exactly.
function toMemoryRecord(r: ContribStore["records"][number]): MemoryRecord {
  // Omit source_image; keep everything the explorer parser expects.
  const { source_image: _omit, ...rest } = r;
  void _omit;
  return rest;
}

/** Pure projection: full store → the explorer's manifest shape. */
export function toExplorerManifest(
  store: ContribStore,
  city: CityConfig,
): ExplorerManifest {
  return {
    city,
    memories: store.records
      .filter((r) => r.status === "approved")
      .map(toMemoryRecord),
  };
}

/** fs seam: write the published manifest to public/memories/manifest.json. */
export async function publishManifest(
  store: ContribStore,
  city: CityConfig,
): Promise<void> {
  const manifest = toExplorerManifest(store, city);
  const path = join(PUBLIC_MEMORIES_DIR, "manifest.json");
  await writeFile(path, JSON.stringify(manifest, null, 2));
}
```

- [ ] **Step 4: Create the paths module it depends on**

Create `web/src/server/paths.ts`:

```ts
import { join } from "node:path";

// Resolved server directories. Defaults keep everything inside web/; env vars let
// the exhibition machine point the recon inbox at S1's input folder. The web
// process never runs SHARP — it only reads/writes these directories.
const cwd = process.cwd();

/** Original uploaded photos (provenance, re-runs). Git-ignored under web/data/. */
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? join(cwd, "data", "uploads");

/** Where uploads are copied for the curator's manual S1 run. */
export const RECON_INBOX = process.env.RECON_INBOX ?? join(cwd, "data", "inbox");

/** The explorer's asset + manifest directory. */
export const PUBLIC_MEMORIES_DIR =
  process.env.PUBLIC_MEMORIES_DIR ?? join(cwd, "public", "memories");
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && npx vitest run test/server.publish.test.ts`
Expected: PASS (4 tests). (`publish.ts` imports `paths.ts`, but the test only calls the pure
`toExplorerManifest`, so no fs runs.)

- [ ] **Step 6: Commit**

```bash
git add web/src/server/publish.ts web/src/server/paths.ts web/test/server.publish.test.ts
git commit -m "feat(s3): publish approved records into explorer manifest"
```

## Task 8: ~~Auth (constant-time password check)~~ — REMOVED

**Dropped per user direction (2026-06-03):** this installation is curated and run locally, so no
authentication is built. There is no `auth.ts`, no `CURATOR_PASSWORD`, no login route, and no route
guards. The contribution/admin routes and pages are open. (Skip straight to Task 9.)

## Task 9: Ingest matching (which splat assets to expect)

**Files:**
- Create: `web/src/server/ingest.ts`
- Test: `web/test/server.ingest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/test/server.ingest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { expectedAssets, resolveIngest } from "@/server/ingest";

describe("expectedAssets", () => {
  it("derives the asset filenames S1+convert-splats produce for an id", () => {
    expect(expectedAssets("photo_42")).toEqual({
      splat: "photo_42.sog",
      preview: "photo_42.preview.ply",
      thumbnail: "photo_42.jpg",
    });
  });
});

describe("resolveIngest", () => {
  it("returns ready + urls when the splat and thumb are present", () => {
    const present = new Set(["photo_42.sog", "photo_42.preview.ply", "photo_42.jpg"]);
    expect(resolveIngest("photo_42", present)).toEqual({
      ok: true,
      patch: { status: "ready", splat_url: "photo_42.sog", thumbnail_url: "photo_42.jpg" },
    });
  });

  it("fails when the splat is missing (S1 hasn't run / failed)", () => {
    const present = new Set(["photo_42.jpg"]);
    expect(resolveIngest("photo_42", present)).toEqual({
      ok: false,
      reason: "splat photo_42.sog not found in public/memories",
    });
  });

  it("still readies without a thumbnail (thumb is optional for rendering)", () => {
    const present = new Set(["photo_42.sog"]);
    const out = resolveIngest("photo_42", present);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.patch.thumbnail_url).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run test/server.ingest.test.ts`
Expected: FAIL — cannot find module `@/server/ingest`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/server/ingest.ts`:

```ts
import { readdir } from "node:fs/promises";
import type { ContribRecord } from "./types";
import { PUBLIC_MEMORIES_DIR } from "./paths";

export interface ExpectedAssets {
  splat: string;
  preview: string;
  thumbnail: string;
}

/** Filenames S1 + `npm run convert-splats` produce for a record id (by stem). */
export function expectedAssets(id: string): ExpectedAssets {
  return { splat: `${id}.sog`, preview: `${id}.preview.ply`, thumbnail: `${id}.jpg` };
}

export type IngestResult =
  | { ok: true; patch: Partial<ContribRecord> }
  | { ok: false; reason: string };

/**
 * Pure: given the set of filenames present in public/memories, decide whether a
 * record can transition to `ready` and which urls to attach. The splat is
 * required; the thumbnail is optional (used only for far billboards/UI).
 */
export function resolveIngest(id: string, present: ReadonlySet<string>): IngestResult {
  const assets = expectedAssets(id);
  if (!present.has(assets.splat)) {
    return { ok: false, reason: `splat ${assets.splat} not found in public/memories` };
  }
  return {
    ok: true,
    patch: {
      status: "ready",
      splat_url: assets.splat,
      thumbnail_url: present.has(assets.thumbnail) ? assets.thumbnail : "",
    },
  };
}

/** fs seam: list public/memories and run resolveIngest against it. */
export async function ingestFromDisk(id: string): Promise<IngestResult> {
  const present = new Set(await readdir(PUBLIC_MEMORIES_DIR));
  return resolveIngest(id, present);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run test/server.ingest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite + commit**

Run: `cd web && npm test`
Expected: PASS — all prior specs plus the new geo/exif/store/publish/auth/ingest suites (≈ 48 + new).

```bash
git add web/src/server/ingest.ts web/test/server.ingest.test.ts
git commit -m "feat(s3): pure ingest matching (scan public/memories for splat)"
```

---

# Phase 2 — API + auth backend (Route Handlers over the Phase-1 logic)

These tasks wire the pure logic into Next.js 16 Route Handlers. They are exercised by the manual
backend smoke test at the end of the phase (curl/Invoke-WebRequest), not Vitest — Route Handlers are
the framework seam, like S2's WebGL Viewer. Keep handler bodies thin: parse request → call Phase-1
functions → load/mutate/save store → respond.

## Task 10: Install deps, dirs, env, gitignore

**Files:**
- Modify: `web/package.json` (via npm)
- Modify: `web/.gitignore`
- Create: `web/data/.gitkeep`
- Create/modify: `web/.env.local.example`

- [ ] **Step 1: Install runtime deps**

Run: `cd web && npm install exifr maplibre-gl`
Expected: both added to `dependencies`. (`exifr` ships its own types; `maplibre-gl` ships types too.)

- [ ] **Step 2: Ignore the runtime data dir but keep it present**

Add to `web/.gitignore` (after the seed-assets block):

```gitignore
# S3 contribution runtime data: the record store + uploaded originals + recon
# inbox are local state, not source. Keep the dir present via .gitkeep.
/data/*
!/data/.gitkeep
```

Create `web/data/.gitkeep` (empty file).

- [ ] **Step 3: Document env vars**

Create (or append to) `web/.env.local.example`:

```bash
# Where the explorer fetches memory assets (default /memories). See config/explorer.ts.
NEXT_PUBLIC_MEMORIES_BASE_URL=/memories

# S3 — where uploads are copied for the curator's manual SHARP run.
# Point this at S1's input folder on the GPU box for the exhibition.
# RECON_INBOX=../samples/input
```

- [ ] **Step 4: Verify install + build still works**

Run: `cd web && npm run build`
Expected: build SUCCEEDS (no usage yet; just confirms deps resolve).

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/.gitignore web/data/.gitkeep web/.env.local.example
git commit -m "chore(s3): add exifr+maplibre, data dir, curator env, ignore rules"
```

## Task 11: EXIF parse seam + upload route (POST/GET /api/memories)

**Files:**
- Create: `web/src/server/exif.ts`
- Create: `web/src/server/id.ts`
- Create: `web/src/app/api/memories/route.ts`

- [ ] **Step 1: Write the exifr seam**

Create `web/src/server/exif.ts`:

```ts
import exifr from "exifr";
import { extractPlacement, type ExifPlacement } from "@/lib/exif/placement";

/**
 * The un-testable binary seam: run exifr over an image buffer, then hand its
 * output to the pure normalizer. `gps: true` makes exifr compute decimal
 * latitude/longitude. Any parse failure (no EXIF at all) yields an empty
 * placement — the curator then sets the pin manually.
 */
export async function parsePlacement(buffer: Buffer): Promise<ExifPlacement> {
  try {
    const raw = await exifr.parse(buffer, { gps: true });
    return extractPlacement(raw);
  } catch {
    return {};
  }
}
```

- [ ] **Step 2: Write the id helper**

Create `web/src/server/id.ts`:

```ts
import { randomUUID } from "node:crypto";

const SAFE = /[^a-z0-9._-]/gi;

/**
 * A filesystem- and url-safe record id derived from the original filename plus a
 * short unique suffix (so two "IMG_1234.jpg" uploads don't collide). The id is
 * also the asset stem S1 matches outputs by, so it must be stable and clean.
 */
export function makeRecordId(originalName: string): string {
  const stem = originalName.replace(/\.[^.]+$/, "").replace(SAFE, "_").slice(0, 40) || "memory";
  return `${stem}-${randomUUID().slice(0, 8)}`;
}

/** Lowercased extension including the dot, defaulting to .jpg. */
export function extOf(originalName: string): string {
  const m = originalName.toLowerCase().match(/\.(jpe?g|png)$/);
  return m ? m[0] : ".jpg";
}
```

- [ ] **Step 3: Write the route handler**

Create `web/src/app/api/memories/route.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadStore, saveStore, addRecord } from "@/server/store";
import { parsePlacement } from "@/server/exif";
import { makeRecordId, extOf } from "@/server/id";
import { isAuthed } from "@/server/auth";
import { UPLOADS_DIR, RECON_INBOX } from "@/server/paths";
import type { ContribRecord } from "@/server/types";

export const runtime = "nodejs";

// GET /api/memories — list all records (curator review queue). Authed.
export async function GET() {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const store = await loadStore();
  return Response.json(store);
}

// POST /api/memories — multipart upload. Saves the original, copies it to the
// recon inbox for the curator's manual SHARP run, parses EXIF for an initial
// placement, and creates an `uploaded` record. Authed.
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });

  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return new Response("missing 'photo' file field", { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const id = makeRecordId(file.name);
  const filename = `${id}${extOf(file.name)}`;

  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(join(UPLOADS_DIR, filename), buffer);
  await mkdir(RECON_INBOX, { recursive: true });
  await writeFile(join(RECON_INBOX, filename), buffer);

  const placement = await parsePlacement(buffer);

  const record: ContribRecord = {
    id,
    status: "uploaded",
    source_image: filename,
    thumbnail_url: "",
    splat_url: "",
    // Placeholder transform until the curator places it (Task 12). The store
    // holds it; it is NOT published until approved, so the explorer never sees it.
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    geo: placement.geo,
    captured_at: placement.captured_at,
    created_at: new Date().toISOString(),
  };

  const store = await loadStore();
  await saveStore(addRecord(store, record));

  return Response.json({ record }, { status: 201 });
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/exif.ts web/src/server/id.ts web/src/app/api/memories/route.ts
git commit -m "feat(s3): upload route — save image, copy to inbox, EXIF, create record"
```

## Task 12: Placement + single-record route (GET/PATCH /api/memories/[id])

**Files:**
- Create: `web/src/app/api/memories/[id]/route.ts`

- [ ] **Step 1: Write the route handler**

Create `web/src/app/api/memories/[id]/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { geoToTransform } from "@/lib/geo/transform";
import { isAuthed } from "@/server/auth";
import { CITY } from "@/config/explorer";
import type { ContribRecord } from "@/server/types";

export const runtime = "nodejs";

const ORIGIN = { lat: CITY.origin_lat, lon: CITY.origin_lon };

// GET /api/memories/[id] — one record (drives the placement page). Authed.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const record = findById(await loadStore(), id);
  if (!record) return new Response("not found", { status: 404 });
  return Response.json({ record });
}

interface PlacementBody {
  lat: number;
  lon: number;
  heading_deg: number;
  scale?: number;
}

// PATCH /api/memories/[id] — apply the curator's map placement: recompute the
// world transform from lat/lon + heading + scale (the geo math S2 doesn't do).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = (await request.json()) as Partial<PlacementBody>;
  const { lat, lon, heading_deg } = body;
  if (![lat, lon, heading_deg].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return new Response("lat, lon, heading_deg must be finite numbers", { status: 400 });
  }
  const scale = typeof body.scale === "number" && body.scale > 0 ? body.scale : 1;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  const patch: Partial<ContribRecord> = {
    geo: { lat: lat!, lon: lon! },
    heading_deg: heading_deg!,
    transform: geoToTransform({ lat: lat!, lon: lon! }, ORIGIN, heading_deg!, scale),
  };
  const next = updateRecord(store, id, patch);
  await saveStore(next);
  return Response.json({ record: findById(next, id) });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no type errors. (If `RouteContext` is reported as undefined, run `npx next typegen` first —
its types are generated by dev/build/typegen per the Next 16 docs.)

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/memories/[id]/route.ts
git commit -m "feat(s3): placement route — geo+heading+scale -> stored transform"
```

## Task 13: Ingest + approve routes

**Files:**
- Create: `web/src/app/api/memories/[id]/ingest/route.ts`
- Create: `web/src/app/api/memories/[id]/approve/route.ts`

- [ ] **Step 1: Write the ingest route**

Create `web/src/app/api/memories/[id]/ingest/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { ingestFromDisk } from "@/server/ingest";
import { isAuthed } from "@/server/auth";

export const runtime = "nodejs";

// POST /api/memories/[id]/ingest — after the curator has run S1 + convert-splats
// and dropped <id>.sog into public/memories, scan for it and flip to `ready`.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]/ingest">) {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  const result = await ingestFromDisk(id);
  if (!result.ok) return new Response(result.reason, { status: 409 });

  const next = updateRecord(store, id, result.patch);
  await saveStore(next);
  return Response.json({ record: findById(next, id) });
}
```

- [ ] **Step 2: Write the approve route**

Create `web/src/app/api/memories/[id]/approve/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { publishManifest } from "@/server/publish";
import { isAuthed } from "@/server/auth";
import { CITY } from "@/config/explorer";

export const runtime = "nodejs";

// POST /api/memories/[id]/approve — the curated gate. Only `ready` records (a
// splat exists) can be approved; approving republishes the explorer manifest so
// the memory appears in the void.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]/approve">) {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const store = await loadStore();
  const record = findById(store, id);
  if (!record) return new Response("not found", { status: 404 });
  if (record.status !== "ready" && record.status !== "approved") {
    return new Response(`cannot approve a '${record.status}' record (ingest a splat first)`, {
      status: 409,
    });
  }

  const next = updateRecord(store, id, { status: "approved" });
  await saveStore(next);
  await publishManifest(next, { name: CITY.name, origin_lat: CITY.origin_lat, origin_lon: CITY.origin_lon });
  return Response.json({ record: findById(next, id) });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/memories/[id]/ingest/route.ts web/src/app/api/memories/[id]/approve/route.ts
git commit -m "feat(s3): ingest (scan splat -> ready) + approve (publish manifest) routes"
```

## Task 14: Login route + curator cookie

**Files:**
- Create: `web/src/app/api/login/route.ts`

- [ ] **Step 1: Write the login route**

Create `web/src/app/api/login/route.ts`:

```ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { checkPassword, AUTH_COOKIE } from "@/server/auth";

export const runtime = "nodejs";

// POST /api/login — exchange the shared curator password for an auth cookie.
// Minimal auth per the spec: no accounts, one password, curator-only.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const password = body.password ?? "";
  if (!checkPassword(password, process.env.CURATOR_PASSWORD)) {
    return new Response("wrong password", { status: 401 });
  }
  const jar = await cookies();
  jar.set(AUTH_COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // one week
  });
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Backend smoke test (manual — the framework seam)**

This proves the whole API end-to-end without the UI. Run the production server, then drive it with
PowerShell. (Use a real Wolfsburg photo with GPS if you have one; any JPEG works for the flow.)

```powershell
cd web
"CURATOR_PASSWORD=test-pass" | Out-File -Encoding utf8 .env.local
npm run build; npm run start   # serves http://localhost:3000
```

In a second terminal:

```powershell
$base = "http://localhost:3000"
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
# 1. login -> cookie
Invoke-WebRequest "$base/api/login" -Method POST -WebSession $sess `
  -ContentType "application/json" -Body '{"password":"test-pass"}'
# 2. upload a photo (multipart)
$form = @{ photo = Get-Item ".\public\memories\*.jpg" | Select-Object -First 1 }
$up = Invoke-WebRequest "$base/api/memories" -Method POST -WebSession $sess -Form $form
$id = ($up.Content | ConvertFrom-Json).record.id
# 3. place it (Wolfsburg-ish coords + heading)
Invoke-WebRequest "$base/api/memories/$id" -Method PATCH -WebSession $sess `
  -ContentType "application/json" -Body '{"lat":52.4227,"lon":10.7865,"heading_deg":90,"scale":1}'
# 4. ingest: drop a splat named <id>.sog into public/memories first, then:
Copy-Item ".\public\memories\*.sog" ".\public\memories\$id.sog" -ErrorAction SilentlyContinue
Invoke-WebRequest "$base/api/memories/$id/ingest" -Method POST -WebSession $sess
# 5. approve -> republishes manifest.json
Invoke-WebRequest "$base/api/memories/$id/approve" -Method POST -WebSession $sess
# 6. confirm the memory is now in the published manifest
(Get-Content ".\public\memories\manifest.json" | ConvertFrom-Json).memories.id
```

Expected: step 6 lists `$id`. Confirm `data/memories.json` exists with the full record, the original
is under `data/uploads/`, a copy is under `data/inbox/`, and the manifest `city` is Wolfsburg.
Record any issues and fix before proceeding. Then restore a clean state:

```powershell
Remove-Item .env.local; git checkout web/public/memories/manifest.json
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/login/route.ts
git commit -m "feat(s3): curator login route (shared-password cookie)"
```

---

# Phase 3 — Contribution UI (thin client pages over the API)

MapLibre GL renders to a canvas and is the un-testable seam here, proven by the final browser smoke
test (mirroring S2's WebGL seam). Pages stay thin: forms/maps that call the Phase-2 API. No new pure
logic — the geo math already lives in tested modules and runs server-side in PATCH.

## Task 15: Upload page (+ password gate)

**Files:**
- Create: `web/src/app/contribute/page.tsx`

- [ ] **Step 1: Write the upload page**

Create `web/src/app/contribute/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Curator-facing: log in with the shared password, then drag/choose a photo. On
// success we jump to the placement page for the new record. Deliberately plain —
// this is a curation tool, not a public page.
export default function ContributePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) setAuthed(true);
    else setError("Wrong password.");
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData(e.currentTarget);
      const r = await fetch("/api/memories", { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      const { record } = await r.json();
      router.push(`/contribute/${record.id}`);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", font: "16px system-ui", color: "#e6e9f0" }}>
      <h1>Add a memory — Wolfsburg</h1>
      {!authed ? (
        <form onSubmit={login}>
          <p>Curator password:</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
          <button type="submit" style={{ marginTop: 12, padding: "8px 16px" }}>
            Unlock
          </button>
        </form>
      ) : (
        <form onSubmit={upload}>
          <p>Choose a city photo (JPEG/PNG; originals keep their GPS + focal length):</p>
          <input type="file" name="photo" accept="image/jpeg,image/png" required />
          <button type="submit" disabled={busy} style={{ marginTop: 12, padding: "8px 16px" }}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </form>
      )}
      {error && <p style={{ color: "#ff8080" }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build`
Expected: build SUCCEEDS; `/contribute` is listed as a route.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/contribute/page.tsx
git commit -m "feat(s3): contribute upload page (password gate + photo upload)"
```

## Task 16: MapLibre placement component

**Files:**
- Create: `web/src/app/contribute/[id]/PlacementMap.tsx`

- [ ] **Step 1: Write the placement map**

Create `web/src/app/contribute/[id]/PlacementMap.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const WOLFSBURG = { lat: 52.4227, lon: 10.7865 };

// Key-free OSM raster style (fine for a curation tool / uni exhibition).
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export interface Placement {
  lat: number;
  lon: number;
  heading_deg: number;
  scale: number;
}

/**
 * Draggable pin on a Wolfsburg map + heading + scale controls. MapLibre is the
 * un-testable canvas seam; the geo math it feeds (lat/lon/heading -> transform)
 * runs server-side in the PATCH route and is unit-tested. `onSave` posts the
 * placement; the parent handles navigation.
 */
export default function PlacementMap({
  initial,
  onSave,
}: {
  initial: Partial<Placement>;
  onSave: (p: Placement) => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [lat, setLat] = useState(initial.lat ?? WOLFSBURG.lat);
  const [lon, setLon] = useState(initial.lon ?? WOLFSBURG.lon);
  const [heading, setHeading] = useState(initial.heading_deg ?? 0);
  const [scale, setScale] = useState(initial.scale ?? 1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: OSM_STYLE,
      center: [lon, lat],
      zoom: 14,
    });
    const marker = new maplibregl.Marker({ draggable: true }).setLngLat([lon, lat]).addTo(map);
    marker.on("dragend", () => {
      const ll = marker.getLngLat();
      setLat(ll.lat);
      setLon(ll.lng);
    });
    markerRef.current = marker;
    return () => map.remove();
    // Mount once; subsequent state changes update the marker via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in sync if lat/lon change from the number inputs.
  useEffect(() => {
    markerRef.current?.setLngLat([lon, lat]);
  }, [lat, lon]);

  async function save() {
    setSaving(true);
    try {
      await onSave({ lat, lon, heading_deg: heading, scale });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div ref={container} style={{ width: "100%", height: 360, borderRadius: 8 }} />
      <label>
        Facing heading: {heading}° (0 = north, 90 = east)
        <input
          type="range"
          min={0}
          max={359}
          value={heading}
          onChange={(e) => setHeading(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </label>
      <label>
        Scale nudge: ×{scale.toFixed(2)}
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </label>
      <p style={{ font: "13px monospace", color: "#9aa3b8" }}>
        lat {lat.toFixed(5)}, lon {lon.toFixed(5)}
      </p>
      <button onClick={save} disabled={saving} style={{ padding: "8px 16px" }}>
        {saving ? "Saving…" : "Save placement"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build`
Expected: build SUCCEEDS. (If the maplibre CSS import errors under Turbopack, confirm Next 16 handles
CSS imports from node_modules — it does by default; no config needed.)

- [ ] **Step 3: Commit**

```bash
git add web/src/app/contribute/[id]/PlacementMap.tsx
git commit -m "feat(s3): MapLibre placement map (pin + heading + scale)"
```

## Task 17: Placement page (loads record, saves placement)

**Files:**
- Create: `web/src/app/contribute/[id]/page.tsx`

- [ ] **Step 1: Write the placement page**

Create `web/src/app/contribute/[id]/page.tsx`:

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlacementMap, { type Placement } from "./PlacementMap";
import type { ContribRecord } from "@/server/types";

export default function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [record, setRecord] = useState<ContribRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/memories/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((d) => setRecord(d.record))
      .catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  async function save(p: Placement) {
    const r = await fetch(`/api/memories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!r.ok) {
      setError(await r.text());
      return;
    }
    setDone(true);
  }

  if (error) return <main style={wrap}><p style={{ color: "#ff8080" }}>{error}</p></main>;
  if (!record) return <main style={wrap}><p>Loading…</p></main>;

  return (
    <main style={wrap}>
      <h1>Place this memory</h1>
      <p style={{ color: "#9aa3b8" }}>
        {record.source_image}
        {record.geo ? " — pin auto-placed from photo GPS; drag to adjust." : " — no GPS in photo; drop the pin manually."}
      </p>
      <PlacementMap
        initial={{
          lat: record.geo?.lat,
          lon: record.geo?.lon,
          heading_deg: record.heading_deg ?? 0,
          scale: 1,
        }}
        onSave={save}
      />
      {done && (
        <p style={{ color: "#80ff9f" }}>
          Saved. Next: run SHARP on the inbox image, drop <code>{record.id}.sog</code> into
          public/memories, then ingest + approve in{" "}
          <button onClick={() => router.push("/admin")} style={{ textDecoration: "underline" }}>
            the review queue
          </button>.
        </p>
      )}
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 640,
  margin: "6vh auto",
  font: "16px system-ui",
  color: "#e6e9f0",
};
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build`
Expected: build SUCCEEDS; `/contribute/[id]` listed.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/contribute/[id]/page.tsx
git commit -m "feat(s3): placement page (load record, save geo placement)"
```

## Task 18: Admin review queue (list, ingest, approve)

**Files:**
- Create: `web/src/app/admin/page.tsx`

- [ ] **Step 1: Write the admin page**

Create `web/src/app/admin/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContribRecord } from "@/server/types";

// Curator review queue: list every record with its lifecycle status, run ingest
// (scan public/memories for the splat) and approve (publish to the explorer).
export default function AdminPage() {
  const [records, setRecords] = useState<ContribRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/memories");
    if (r.status === 401) {
      setError("Locked. Unlock at /contribute first.");
      return;
    }
    if (!r.ok) {
      setError(await r.text());
      return;
    }
    setError(null);
    setRecords((await r.json()).records);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function act(id: string, action: "ingest" | "approve") {
    const r = await fetch(`/api/memories/${id}/${action}`, { method: "POST" });
    if (!r.ok) setError(`${action} failed: ${await r.text()}`);
    await refresh();
  }

  return (
    <main style={{ maxWidth: 760, margin: "6vh auto", font: "15px system-ui", color: "#e6e9f0" }}>
      <h1>Review queue — Wolfsburg</h1>
      {error && <p style={{ color: "#ff8080" }}>{error}</p>}
      {!records ? (
        <p>Loading…</p>
      ) : records.length === 0 ? (
        <p>No memories yet. Add one at <a href="/contribute">/contribute</a>.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2f3a" }}>
              <th>id</th><th>status</th><th>geo</th><th>actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #1a1f29" }}>
                <td style={{ fontFamily: "monospace" }}>{r.id}</td>
                <td>{r.status}</td>
                <td>{r.geo ? `${r.geo.lat.toFixed(3)}, ${r.geo.lon.toFixed(3)}` : "—"}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => act(r.id, "ingest")} disabled={r.status === "approved"}>
                    Ingest splat
                  </button>
                  <button onClick={() => act(r.id, "approve")} disabled={r.status !== "ready" && r.status !== "approved"}>
                    Approve
                  </button>
                  <a href={`/contribute/${r.id}`}>Re-place</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify build + full test suite**

Run: `cd web && npm run build && npm test`
Expected: build SUCCEEDS (`/admin`, `/contribute`, `/contribute/[id]`, and the 5 API routes listed);
all Vitest specs PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/admin/page.tsx
git commit -m "feat(s3): admin review queue (list, ingest, approve)"
```

## Task 19: End-to-end browser smoke test + docs

**Files:**
- Modify: `web/README.md`
- Modify: `CLAUDE.md` (repo root)

- [ ] **Step 1: Run the end-to-end smoke test (the spec's S3 verify)**

The spec's bar (lines 70–71): "upload → EXIF placed → adjust → run SHARP → approve → appears at the
right place/orientation."

```powershell
cd web
"CURATOR_PASSWORD=test-pass`nRECON_INBOX=../samples/input" | Out-File -Encoding utf8 .env.local
npm run build; npm run start
```

In the browser at http://localhost:3000:

- [ ] `/contribute` — unlock with `test-pass`, upload a Wolfsburg photo (ideally with GPS).
- [ ] Redirected to `/contribute/<id>` — map shows a pin (auto-placed if the photo had GPS, else
      Wolfsburg centre). Drag the pin, set heading + scale, **Save placement**.
- [ ] Run SHARP on the inbox image on the GPU box, then `npm run convert-splats`, and drop
      `<id>.sog` + `<id>.preview.ply` + `<id>.jpg` into `public/memories/`. (For a pure flow test
      without a GPU, copy an existing seed `.sog`/`.preview.ply`/`.jpg` to those names.)
- [ ] `/admin` — the record shows `uploaded`; click **Ingest splat** → `ready`; click **Approve** →
      `approved`.
- [ ] Open `/` (the explorer) — the new memory renders at its Wolfsburg location and orientation in
      the dark void.

Record results. Restore clean state:

```powershell
Remove-Item .env.local; git checkout web/public/memories/manifest.json
```

- [ ] **Step 2: Document S3 in the web README**

Add an "## S3 — Contribution flow" section to `web/README.md` covering: the curator password
(`CURATOR_PASSWORD`), the three pages (`/contribute`, `/contribute/[id]`, `/admin`), the
upload→place→(manual SHARP)→ingest→approve lifecycle, the `data/` store layout, and that geo math
(`lib/geo/**`) is S3's and is unit-tested while MapLibre is the manual seam. Mirror the existing
README's tone and the "verify on a production build" caution.

- [ ] **Step 3: Mark S3 built in CLAUDE.md**

In `CLAUDE.md`, update the S3 bullet under "Architecture" from a plan to **[BUILT]**, noting: geo
projection + heading→quaternion live in `web/src/lib/geo/**` (the geo math S2 omits); a JSON store
under `web/data/` holds the lifecycle; approval publishes `public/memories/manifest.json`; SHARP runs
manually (filesystem bridge via `RECON_INBOX`); minimal shared-password auth. Update the
"Current state" line to note S3 is built.

- [ ] **Step 4: Final commit**

```bash
git add web/README.md CLAUDE.md
git commit -m "docs(s3): contribution flow — README + CLAUDE.md, S3 built"
```

---

## Self-Review (completed against the spec)

- **Spec line 65 (upload + EXIF lat/lon, capture time):** Tasks 5, 11 (POST /api/memories +
  `parsePlacement` + `extractPlacement`). ✓
- **Spec line 66–67 (MapLibre map, pin from EXIF draggable, rotatable facing-arrow, scale nudge →
  writes record):** Tasks 16, 17, 12 (PATCH applies `geoToTransform`). ✓
- **Spec line 68 (enqueue/trigger S1; approve flag before explorer):** Tasks 11 (copy to
  `RECON_INBOX`), 13 (ingest + approve→publish). Manual SHARP per "CLI trigger acceptable for MVP". ✓
- **Spec line 69 (minimal auth — shared password, curator-only):** **dropped per user direction
  (2026-06-03)** — curated, locally-run installation; routes/pages are open. (Tasks 8 + 14 removed.) ✓
- **Spec line 70–71 (end-to-end verify):** Task 19 + the Task 14 backend smoke test. ✓
- **Geo math (spec lines 73–76):** Tasks 2–4, equirectangular + heading→yaw, locked to seed
  convention and Wolfsburg origin. ✓
- **Data model (spec lines 78–81):** `ContribRecord` (Task 6) extends the explorer record with
  `source_image`; `city{name,origin_lat,origin_lon}` set to Wolfsburg (Task 1). ✓
- **Type consistency:** `ContribRecord`, `ContribStore`, `emptyStore/addRecord/updateRecord/findById`,
  `geoToTransform`, `extractPlacement/ExifPlacement`, `resolveIngest/expectedAssets`,
  `checkPassword/AUTH_COOKIE`, `toExplorerManifest/publishManifest`, `Placement` are used with the
  same signatures across tasks. ✓
- **Deferred (YAGNI, per spec lines 91–96):** no job queue (manual SHARP), no per-user accounts (one
  password), no SQLite (JSON file), no real OSM lines in the explorer. ✓
```
