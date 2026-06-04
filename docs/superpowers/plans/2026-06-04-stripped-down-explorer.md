# Stripped-Down Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the contribution flow into the explorer — drag a photo, it auto-places and reconstructs in the background (placeholder sphere → splat) with no location-picker or admin page — and add a faint, toggleable, config-styled Wolfsburg map ground plane.

**Architecture:** Remove the `/contribute` and `/admin` pages; the explorer (`/`) is the whole app and its existing edit mode is untouched. Upload computes the world transform immediately (EXIF GPS → `geoToTransform`, else a camera-front position bridged out of the Canvas). Ingest auto-approves + publishes. The explorer polls the server store, draws placeholder spheres for in-flight memories, and refetches the manifest when one is published. A MapLibre map is rendered once into a `THREE.CanvasTexture` on a ground plane aligned to the same geo projection.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), React 19, React-Three-Fiber + `@sparkjsdev/spark`, three.js, MapLibre GL, Vitest. Work happens entirely in `web/`.

---

## File Structure

**Delete:**
- `web/src/app/contribute/[id]/page.tsx`, `page.module.css`, `PlacementMap.tsx`, `PlacementMap.module.css`
- `web/src/app/admin/page.tsx`
- `web/src/app/api/memories/[id]/approve/route.ts`
- `web/src/components/MemoryEditor3D.tsx`

**Create:**
- `web/src/lib/upload/placement.ts` — pure: decide a fresh upload's transform (geo vs camera-front)
- `web/src/lib/camera/pose.ts` — module-level camera-pose bridge (probe writes, drop handler reads)
- `web/src/components/CameraPoseProbe.tsx` — in-Canvas: write live camera pose each frame
- `web/src/lib/pending/select.ts` — pure: which records are pending / unpublished-approved
- `web/src/hooks/usePendingMemories.ts` — poll the server store
- `web/src/components/PendingSpheres.tsx` — placeholder wireframe spheres
- `web/src/lib/map/style.ts` — OSM `StyleSpecification`
- `web/src/lib/map/extent.ts` — pure: span → world plane size + lon/lat bbox
- `web/src/lib/map/groundTexture.ts` — render MapLibre to an offscreen canvas (browser seam)
- `web/src/components/MapGround.tsx` — the faint ground plane
- Tests: `web/test/upload.placement.test.ts`, `web/test/camera.pose.test.ts`, `web/test/pending.select.test.ts`, `web/test/map.extent.test.ts`

**Modify:**
- `web/src/app/api/memories/route.ts` — POST computes transform on upload
- `web/src/app/api/memories/[id]/route.ts` — drop the map-placement `PATCH` (keep `GET`)
- `web/src/app/api/memories/[id]/ingest/route.ts` — auto-approve + publish
- `web/src/components/DropToContribute.tsx` — no navigation; send camera pose; toast
- `web/src/hooks/useManifest.ts` — accept a `version` to force refetch
- `web/src/config/explorer.ts` — add `MAP` config
- `web/src/components/SplatWorld.tsx` — wire probe, pending spheres, map ground, toggles

**Test runner:** all Vitest specs live in `web/test/`; `@/` resolves to `web/src/`. Run a single file with `npx vitest run test/<file>` from `web/`; the full suite with `npm test`.

---

## Task 1: Remove the contribution & admin pages

No new behavior — deletions plus trimming one route file. Verification is "the app still builds and the existing suite stays green."

**Files:**
- Delete: `web/src/app/contribute/[id]/page.tsx`, `web/src/app/contribute/[id]/page.module.css`, `web/src/app/contribute/[id]/PlacementMap.tsx`, `web/src/app/contribute/[id]/PlacementMap.module.css`
- Delete: `web/src/app/admin/page.tsx`
- Delete: `web/src/app/api/memories/[id]/approve/route.ts`
- Delete: `web/src/components/MemoryEditor3D.tsx`
- Modify: `web/src/app/api/memories/[id]/route.ts`

- [ ] **Step 1: Delete the page/component/route files**

```bash
cd web
git rm -r src/app/contribute src/app/admin src/app/api/memories/[id]/approve src/components/MemoryEditor3D.tsx
```

- [ ] **Step 2: Trim `[id]/route.ts` to just `GET`**

Replace the entire contents of `web/src/app/api/memories/[id]/route.ts` with:

```ts
import type { NextRequest } from "next/server";
import { loadStore, findById } from "@/server/store";

export const runtime = "nodejs";

// GET /api/memories/[id] — one record. Open (no auth). The map-placement PATCH
// was removed with the contribution page; edit-mode transform saves go through
// /api/memories/[id]/transform instead.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]">) {
  const { id } = await ctx.params;
  const record = findById(await loadStore(), id);
  if (!record) return new Response("not found", { status: 404 });
  return Response.json({ record });
}
```

- [ ] **Step 3: Confirm nothing else imports the deleted modules**

Run (from `web/`):
```bash
grep -rn "contribute\|/admin\|MemoryEditor3D\|PlacementMap\|/approve" src
```
Expected: no matches in `src` except possibly a stale comment. `DropToContribute.tsx` still contains `useRouter`/`/contribute` — that is rewritten in Task 4, leave it for now (it compiles; the route is only a runtime target). If grep shows an import of a deleted file anywhere else, stop and fix it.

- [ ] **Step 4: Build + test to verify nothing broke**

Run (from `web/`):
```bash
npm run build && npm test
```
Expected: build succeeds; all existing specs pass (no spec imports the deleted route/components).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web): remove contribute + admin pages (collapse into explorer)"
```

---

## Task 2: Auto-approve + publish on ingest

The watcher's `ingest` callback now takes a memory all the way to visible — no admin gate.

**Files:**
- Modify: `web/src/app/api/memories/[id]/ingest/route.ts`

- [ ] **Step 1: Rewrite the ingest route to publish on success**

Replace the entire contents of `web/src/app/api/memories/[id]/ingest/route.ts` with:

```ts
import type { NextRequest } from "next/server";
import { loadStore, saveStore, updateRecord, findById } from "@/server/store";
import { ingestFromDisk } from "@/server/ingest";
import { publishManifest } from "@/server/publish";
import { CITY } from "@/config/explorer";

export const runtime = "nodejs";

// POST /api/memories/[id]/ingest — the watcher's callback after S1 +
// convert-splats dropped <id>.sog into public/memories. Flip to `ready`, then
// (no admin gate in the stripped-down flow) auto-approve and republish the
// manifest so the memory appears in the explorer. Open (no auth).
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/memories/[id]/ingest">) {
  const { id } = await ctx.params;

  const store = await loadStore();
  if (!findById(store, id)) return new Response("not found", { status: 404 });

  const result = await ingestFromDisk(id);
  if (!result.ok) return new Response(result.reason, { status: 409 });

  // ready (asset urls) → approved in one step, then publish.
  const ready = updateRecord(store, id, result.patch);
  const approved = updateRecord(ready, id, { status: "approved" });
  await saveStore(approved);
  await publishManifest(approved, {
    name: CITY.name,
    origin_lat: CITY.origin_lat,
    origin_lon: CITY.origin_lon,
  });

  return Response.json({ record: findById(approved, id) });
}
```

- [ ] **Step 2: Build + test**

Run (from `web/`):
```bash
npm run build && npm test
```
Expected: build succeeds; suite green (the `publish`/`ingest` pure-logic specs are unaffected; routes have no specs by convention — this seam is verified manually in Task 7).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(web): ingest auto-approves + publishes (no admin gate)"
```

---

## Task 3: Compute the upload transform immediately

A dropped photo gets its world transform at upload time: EXIF GPS when present, else a position in front of the camera.

**Files:**
- Create: `web/src/lib/upload/placement.ts`
- Test: `web/test/upload.placement.test.ts`
- Modify: `web/src/app/api/memories/route.ts`

- [ ] **Step 1: Write the failing test**

Create `web/test/upload.placement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { placementTransform } from "@/lib/upload/placement";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("placementTransform", () => {
  it("uses EXIF GPS when present (projected, identity-ish orientation)", () => {
    const t = placementTransform({ geo: ORIGIN }, ORIGIN, 10);
    // At the origin the projection is [0,0,0]; heading 0 → identity quaternion.
    expect(t.position).toEqual([0, 0, 0]);
    expect(t.quaternion).toEqual([0, 0, 0, 1]);
    expect(t.scale).toEqual([1, 1, 1]);
  });

  it("drops in front of the camera when there is no GPS", () => {
    const t = placementTransform(
      { cameraPosition: [0, 5, 0], cameraForward: [0, 0, -2] }, // forward not unit-length
      ORIGIN,
      10,
    );
    // Forward normalized to [0,0,-1], scaled by standoff 10, added to position.
    expect(t.position[0]).toBeCloseTo(0, 6);
    expect(t.position[1]).toBeCloseTo(5, 6);
    expect(t.position[2]).toBeCloseTo(-10, 6);
    expect(t.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("falls back to the origin when neither GPS nor camera pose is given", () => {
    const t = placementTransform({}, ORIGIN, 10);
    expect(t.position).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `web/`):
```bash
npx vitest run test/upload.placement.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/upload/placement'`.

- [ ] **Step 3: Implement the helper**

Create `web/src/lib/upload/placement.ts`:

```ts
import type { Geo, Transform, Vec3 } from "@/lib/manifest/types";
import { geoToTransform } from "@/lib/geo/transform";

export interface PlacementInput {
  geo?: Geo;
  cameraPosition?: Vec3;
  cameraForward?: Vec3;
}

/**
 * Decide a fresh upload's world transform with no placement page. EXIF GPS wins
 * (projected to local metres about the city origin). Otherwise drop the memory
 * `standoff` metres in front of the camera. Otherwise (headless / no pose) at
 * the origin — the curator can still move it later in edit mode.
 */
export function placementTransform(
  input: PlacementInput,
  origin: Geo,
  standoff: number,
): Transform {
  if (input.geo) return geoToTransform(input.geo, origin, 0, 1);

  if (input.cameraPosition && input.cameraForward) {
    const [px, py, pz] = input.cameraPosition;
    const [fx, fy, fz] = input.cameraForward;
    const len = Math.hypot(fx, fy, fz) || 1;
    const position: Vec3 = [
      px + (fx / len) * standoff,
      py + (fy / len) * standoff,
      pz + (fz / len) * standoff,
    ];
    return { position, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
  }

  return { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `web/`):
```bash
npx vitest run test/upload.placement.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into the upload route**

Replace the entire contents of `web/src/app/api/memories/route.ts` with:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadStore, saveStore, addRecord } from "@/server/store";
import { parsePlacement } from "@/server/exif";
import { makeRecordId, extOf } from "@/server/id";
import { UPLOADS_DIR, RECON_INBOX } from "@/server/paths";
import { placementTransform } from "@/lib/upload/placement";
import { CITY, FLY_TO_STANDOFF } from "@/config/explorer";
import type { Vec3 } from "@/lib/manifest/types";
import type { ContribRecord } from "@/server/types";

export const runtime = "nodejs";

const ORIGIN = { lat: CITY.origin_lat, lon: CITY.origin_lon };

// GET /api/memories — list all records (drives placeholder spheres + refetch).
export async function GET() {
  const store = await loadStore();
  return Response.json(store);
}

// A form field carrying a Vec3 as JSON (e.g. "[0,5,-10]"). Returns undefined for
// missing/invalid input so placement falls back cleanly.
function parseVec3(form: FormData, key: string): Vec3 | undefined {
  const raw = form.get(key);
  if (typeof raw !== "string") return undefined;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return [v[0], v[1], v[2]];
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

// POST /api/memories — multipart upload. Saves the original, copies it to the
// recon inbox for the GPU watcher, parses EXIF, and creates a `processing`
// record with its world transform already set (EXIF GPS, else the camera-front
// position the client sent). No placement page — the watcher takes it from here.
// Open (no auth).
export async function POST(request: NextRequest) {
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
  const transform = placementTransform(
    {
      geo: placement.geo,
      cameraPosition: parseVec3(form, "camera_position"),
      cameraForward: parseVec3(form, "camera_forward"),
    },
    ORIGIN,
    FLY_TO_STANDOFF,
  );

  const record: ContribRecord = {
    id,
    // Reconstruction is auto-triggered (the GPU watcher picks the inbox copy up),
    // so a fresh upload is already "processing".
    status: "processing",
    source_image: filename,
    thumbnail_url: "",
    splat_url: "",
    transform,
    geo: placement.geo,
    heading_deg: placement.geo ? 0 : undefined,
    captured_at: placement.captured_at,
    created_at: new Date().toISOString(),
  };

  const store = await loadStore();
  await saveStore(addRecord(store, record));

  return Response.json({ record }, { status: 201 });
}
```

- [ ] **Step 6: Build + full suite**

Run (from `web/`):
```bash
npm run build && npm test
```
Expected: build succeeds; all specs pass (including the new `upload.placement` spec).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): compute upload transform on drop (EXIF GPS or camera-front)"
```

---

## Task 4: Camera-pose bridge + drop handler rewrite

A tiny in-Canvas probe publishes the live camera pose to a module ref; the DOM drop handler reads it and sends it with the upload, and no longer navigates.

**Files:**
- Create: `web/src/lib/camera/pose.ts`
- Test: `web/test/camera.pose.test.ts`
- Create: `web/src/components/CameraPoseProbe.tsx`
- Modify: `web/src/components/DropToContribute.tsx`
- Modify: `web/src/components/SplatWorld.tsx` (add the probe to the Canvas)

- [ ] **Step 1: Write the failing test for the pose bridge**

Create `web/test/camera.pose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getCameraPose, setCameraPose } from "@/lib/camera/pose";

describe("camera pose bridge", () => {
  it("defaults to origin looking down -Z", () => {
    const p = getCameraPose();
    expect(p.position).toEqual([0, 0, 0]);
    expect(p.forward).toEqual([0, 0, -1]);
  });

  it("returns the last value written", () => {
    setCameraPose({ position: [1, 2, 3], forward: [0, 0, -1] });
    expect(getCameraPose().position).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `web/`):
```bash
npx vitest run test/camera.pose.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/camera/pose'`.

- [ ] **Step 3: Implement the pose bridge**

Create `web/src/lib/camera/pose.ts`:

```ts
import type { Vec3 } from "@/lib/manifest/types";

export interface CameraPose {
  position: Vec3;
  forward: Vec3;
}

// Module-level mutable bridge between the WebGL camera (inside the R3F Canvas)
// and the DOM drop handler (outside it). CameraPoseProbe writes every frame; the
// drop handler reads on drop so a GPS-less memory lands in front of the view.
let current: CameraPose = { position: [0, 0, 0], forward: [0, 0, -1] };

export function setCameraPose(pose: CameraPose): void {
  current = pose;
}

export function getCameraPose(): CameraPose {
  return current;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `web/`):
```bash
npx vitest run test/camera.pose.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Create the in-Canvas probe**

Create `web/src/components/CameraPoseProbe.tsx`:

```tsx
"use client";

import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { setCameraPose } from "@/lib/camera/pose";

// Publishes the live camera world position + forward to the pose bridge each
// frame so the (outside-Canvas) drop handler can place a GPS-less memory ahead
// of the current view. Renders nothing.
export default function CameraPoseProbe() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    setCameraPose({
      position: [camera.position.x, camera.position.y, camera.position.z],
      forward: [f.x, f.y, f.z],
    });
  });
  return null;
}
```

- [ ] **Step 6: Rewrite the drop handler (no navigation, send pose, toast)**

Replace the entire contents of `web/src/components/DropToContribute.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickImage } from "@/lib/upload/pickImage";
import { getCameraPose } from "@/lib/camera/pose";

// DOM overlay over the explorer canvas: the only entry point for adding a memory.
// Drop a photo anywhere on the window → upload via POST /api/memories → stay on
// the explorer. The new memory's placeholder sphere appears (SplatWorld polls the
// store) and becomes a splat when reconstruction publishes it. We send the live
// camera pose so a GPS-less photo lands in front of the current view.
//
// Pointer-lock note: during free-fly the cursor is OS-captured and browsers don't
// fire file-drop events, so this is naturally inert while flying — no extra code.

const panel: React.CSSProperties = {
  position: "fixed",
  pointerEvents: "none",
  font: "12px system-ui, -apple-system, sans-serif",
  zIndex: 10,
};

type Status = "idle" | "uploading" | "done" | "error";

// A drag carries files only when its types list includes "Files" (vs. dragging
// selected text or a link). Keeps the overlay from flashing on non-file drags.
function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes("Files");
}

export default function DropToContribute() {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // dragenter/dragleave fire per child element; count them so the overlay only
  // clears when the cursor actually leaves the window.
  const depth = useRef(0);

  const upload = useCallback(async (files: FileList) => {
    const picked = pickImage(files);
    if ("error" in picked) {
      setStatus("error");
      setError(picked.error);
      return;
    }
    setStatus("uploading");
    setError(null);
    try {
      const pose = getCameraPose();
      const form = new FormData();
      form.append("photo", picked.file);
      form.append("camera_position", JSON.stringify(pose.position));
      form.append("camera_forward", JSON.stringify(pose.forward));
      const r = await fetch("/api/memories", { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      setStatus("done");
      // Clear the confirmation after a few seconds.
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setStatus("error");
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault(); // allow the drop (and stop the browser navigating to the file)
    };
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void upload(e.dataTransfer!.files);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [upload]);

  return (
    <>
      {/* Persistent hint / status — top-right corner. */}
      <div style={{ ...panel, top: 14, right: 16, color: "var(--ink-mute)", textAlign: "right" }}>
        {status === "idle" && "Drag a photo here to add a memory"}
        {status === "uploading" && "Uploading…"}
        {status === "done" && "Memory added — reconstructing…"}
        {status === "error" && <span style={{ color: "#ff8080" }}>{error}</span>}
      </div>

      {/* Drag overlay — dims the void and confirms the drop target. */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9,
            pointerEvents: "none",
            display: "grid",
            placeItems: "center",
            background: "rgba(8, 10, 18, 0.55)",
          }}
        >
          <div
            style={{
              font: "600 15px system-ui, -apple-system, sans-serif",
              color: "var(--ink)",
              padding: "18px 28px",
              borderRadius: 10,
              border: "1px dashed var(--ink-mute)",
              background: "rgba(8, 10, 18, 0.6)",
            }}
          >
            Drop a photo to add a memory
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 7: Add the probe to the explorer Canvas**

In `web/src/components/SplatWorld.tsx`, add the import near the other component imports (after the `Memories` import on line 8):

```tsx
import CameraPoseProbe from "@/components/CameraPoseProbe";
```

Then, inside the `<Canvas>` (right after `<ContextLossLogger />` on line 163), add:

```tsx
        <CameraPoseProbe />
```

- [ ] **Step 8: Build + full suite**

Run (from `web/`):
```bash
npm run build && npm test
```
Expected: build succeeds; all specs pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(web): bridge camera pose to drop handler; drop stays on explorer"
```

---

## Task 5: Placeholder spheres + manifest refetch

The explorer polls the store, draws a wireframe sphere for each in-flight memory, and refetches the manifest when one gets published.

**Files:**
- Create: `web/src/lib/pending/select.ts`
- Test: `web/test/pending.select.test.ts`
- Create: `web/src/hooks/usePendingMemories.ts`
- Create: `web/src/components/PendingSpheres.tsx`
- Modify: `web/src/hooks/useManifest.ts`
- Modify: `web/src/components/SplatWorld.tsx`

- [ ] **Step 1: Write the failing test for the selection logic**

Create `web/test/pending.select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectPending, hasUnpublishedApproved } from "@/lib/pending/select";
import type { ContribRecord } from "@/server/types";

function rec(id: string, status: ContribRecord["status"]): ContribRecord {
  return {
    id,
    status,
    source_image: `${id}.jpg`,
    thumbnail_url: "",
    splat_url: status === "processing" ? "" : `${id}.sog`,
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

describe("selectPending", () => {
  it("returns processing/ready records not yet in the manifest", () => {
    const store = [rec("a", "processing"), rec("b", "ready"), rec("c", "approved")];
    const ids = selectPending(store, new Set<string>()).map((r) => r.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("drops a record once it appears in the manifest", () => {
    const store = [rec("a", "ready")];
    expect(selectPending(store, new Set(["a"]))).toEqual([]);
  });

  it("ignores failed/uploaded records", () => {
    const store = [rec("a", "failed"), rec("b", "uploaded")];
    expect(selectPending(store, new Set<string>())).toEqual([]);
  });
});

describe("hasUnpublishedApproved", () => {
  it("is true when an approved record is missing from the manifest", () => {
    expect(hasUnpublishedApproved([rec("a", "approved")], new Set<string>())).toBe(true);
  });

  it("is false once it is published", () => {
    expect(hasUnpublishedApproved([rec("a", "approved")], new Set(["a"]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `web/`):
```bash
npx vitest run test/pending.select.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/pending/select'`.

- [ ] **Step 3: Implement the selection logic**

Create `web/src/lib/pending/select.ts`:

```ts
import type { ContribRecord } from "@/server/types";

/**
 * Records to show as placeholder spheres: reconstruction is in flight
 * (`processing`) or finished (`ready`) but not yet published into the explorer
 * manifest. Once a record is published its id is in `manifestIds`, so it drops
 * out and the real splat takes over.
 */
export function selectPending(
  storeRecords: ContribRecord[],
  manifestIds: ReadonlySet<string>,
): ContribRecord[] {
  return storeRecords.filter(
    (r) => (r.status === "processing" || r.status === "ready") && !manifestIds.has(r.id),
  );
}

/**
 * True when the store has an `approved` record that the loaded manifest doesn't
 * know about yet — the explorer should refetch the manifest so its splat loads.
 */
export function hasUnpublishedApproved(
  storeRecords: ContribRecord[],
  manifestIds: ReadonlySet<string>,
): boolean {
  return storeRecords.some((r) => r.status === "approved" && !manifestIds.has(r.id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `web/`):
```bash
npx vitest run test/pending.select.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Create the store-poll hook**

Create `web/src/hooks/usePendingMemories.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import type { ContribRecord } from "@/server/types";

const POLL_MS = 3000;

/**
 * Poll the server store (all lifecycle states) so the explorer can draw
 * placeholder spheres for in-flight memories and detect when one is published.
 * Returns the full record list (empty until the first successful poll).
 */
export function usePendingMemories(): ContribRecord[] {
  const [records, setRecords] = useState<ContribRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const r = await fetch("/api/memories");
        if (r.ok) {
          const store = await r.json();
          if (!cancelled && Array.isArray(store.records)) setRecords(store.records);
        }
      } catch {
        // transient (e.g. server restart) — the next tick retries.
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return records;
}
```

- [ ] **Step 6: Create the placeholder-sphere renderer**

Create `web/src/components/PendingSpheres.tsx`:

```tsx
"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FLY_TO_STANDOFF } from "@/config/explorer";
import type { ContribRecord } from "@/server/types";

// Faint glowing wireframe spheres marking memories whose splat is still being
// reconstructed. One shared geometry + material across all spheres (only the
// per-mesh position differs). Replaced by the real splat once the record is
// published and leaves the pending set. Visual-only; no LOD.
export default function PendingSpheres({ records }: { records: ContribRecord[] }) {
  const geometry = useMemo(
    () => new THREE.SphereGeometry(FLY_TO_STANDOFF * 0.5, 24, 16),
    [],
  );
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#8fb6ff",
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <>
      {records.map((r) => {
        const p = r.transform.position;
        return (
          <mesh
            key={r.id}
            geometry={geometry}
            material={material}
            position={[p[0], p[1], p[2]]}
          />
        );
      })}
    </>
  );
}
```

- [ ] **Step 7: Add a `version` input to `useManifest`**

In `web/src/hooks/useManifest.ts`, change the function signature and effect dependency so a bumped version forces a refetch. Replace lines 18-39 (the `useManifest` function body) with:

```ts
export function useManifest(version: number = 0): ManifestState {
  const [state, setState] = useState<ManifestState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest fetch failed (${r.status})`);
        return r.json();
      })
      .then((raw) => parseManifest(raw))
      .then((manifest) => {
        if (!cancelled) setState({ status: "ready", manifest });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", error: String(err?.message ?? err) });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return state;
}
```

- [ ] **Step 8: Wire pending spheres + refetch into `SplatWorld`**

In `web/src/components/SplatWorld.tsx`:

(a) Add imports near the top (after the `CameraPoseProbe` import added in Task 4):

```tsx
import PendingSpheres from "@/components/PendingSpheres";
import { usePendingMemories } from "@/hooks/usePendingMemories";
import { selectPending, hasUnpublishedApproved } from "@/lib/pending/select";
```

(b) Replace the manifest line `const m = useManifest();` (line 39) with version-driven state + the store poll:

```tsx
  const [manifestVersion, setManifestVersion] = useState(0);
  const m = useManifest(manifestVersion);
  const storeRecords = usePendingMemories();
```

(c) After `const baseRecords = ...` (line 41), derive the manifest id set, the pending list, and a refetch effect. Add:

```tsx
  const manifestIds = useMemo(() => new Set(baseRecords.map((r) => r.id)), [baseRecords]);
  const pending = useMemo(
    () => selectPending(storeRecords, manifestIds),
    [storeRecords, manifestIds],
  );

  // When the store has an approved memory the loaded manifest doesn't include
  // yet, refetch so its splat loads (and its placeholder sphere drops out).
  useEffect(() => {
    if (hasUnpublishedApproved(storeRecords, manifestIds)) {
      setManifestVersion((v) => v + 1);
    }
  }, [storeRecords, manifestIds]);
```

(d) Render the spheres inside the `<Canvas>`, right after the `{m.status === "ready" && (<Memories ... />)}` block (after line 169):

```tsx
        <PendingSpheres records={pending} />
```

- [ ] **Step 9: Build + full suite**

Run (from `web/`):
```bash
npm run build && npm test
```
Expected: build succeeds; all specs pass (including `pending.select`).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): placeholder spheres for in-flight memories + manifest refetch on publish"
```

---

## Task 6: Faint Wolfsburg map ground plane

A static MapLibre render becomes a `THREE.CanvasTexture` on a ground plane aligned to the geo projection; styling is config-only, visibility toggles at runtime.

**Files:**
- Create: `web/src/lib/map/style.ts`
- Create: `web/src/lib/map/extent.ts`
- Test: `web/test/map.extent.test.ts`
- Create: `web/src/lib/map/groundTexture.ts`
- Create: `web/src/components/MapGround.tsx`
- Modify: `web/src/config/explorer.ts`
- Modify: `web/src/components/SplatWorld.tsx`

- [ ] **Step 1: Create the OSM style module**

Create `web/src/lib/map/style.ts`:

```ts
import type { StyleSpecification } from "maplibre-gl";

// Key-free OSM raster style (fine for a curated uni exhibition). This is the
// swappable surface for restyling the ground map — replace this object, or any
// field of `MAP` in config/explorer.ts. `import type` keeps maplibre-gl out of
// any server bundle that transitively imports config (the type is erased).
export const OSM_STYLE: StyleSpecification = {
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
```

- [ ] **Step 2: Write the failing test for the extent math**

Create `web/test/map.extent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groundExtent } from "@/lib/map/extent";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("groundExtent", () => {
  it("returns the span as the world plane size", () => {
    expect(groundExtent(ORIGIN, 4000).size).toBe(4000);
  });

  it("returns a lon/lat bbox centered on the origin", () => {
    const { bounds } = groundExtent(ORIGIN, 4000);
    const [west, south, east, north] = bounds;
    // Symmetric about the origin.
    expect((west + east) / 2).toBeCloseTo(ORIGIN.lon, 6);
    expect((south + north) / 2).toBeCloseTo(ORIGIN.lat, 6);
    // 2 km half-span north ≈ 2000 / 111320 degrees of latitude.
    expect(north - ORIGIN.lat).toBeCloseTo(2000 / 111320, 6);
    // Longitude degrees are wider-spaced (divided by cos(lat)), so dLon > dLat.
    expect(east - ORIGIN.lon).toBeGreaterThan(north - ORIGIN.lat);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `web/`):
```bash
npx vitest run test/map.extent.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/map/extent'`.

- [ ] **Step 4: Implement the extent math**

Create `web/src/lib/map/extent.ts`:

```ts
import type { Geo } from "@/lib/manifest/types";

// Must match lib/geo/project's equirectangular model so the texture lines up
// with where memories project.
const M_PER_DEG_LAT = 111_320;

export interface GroundExtent {
  /** Plane size in world metres (square, centered on the origin). */
  size: number;
  /** Geographic bounds [west, south, east, north] for MapLibre to render. */
  bounds: [number, number, number, number];
}

/**
 * A square ground `spanMeters` on a side, centered on the city origin. Returns
 * the world-space plane size and the lon/lat bbox MapLibre must draw so the map
 * texture aligns with the memories above it.
 */
export function groundExtent(origin: Geo, spanMeters: number): GroundExtent {
  const half = spanMeters / 2;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  const dLat = half / M_PER_DEG_LAT;
  const dLon = half / mPerDegLon;
  return {
    size: spanMeters,
    bounds: [origin.lon - dLon, origin.lat - dLat, origin.lon + dLon, origin.lat + dLat],
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `web/`):
```bash
npx vitest run test/map.extent.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Create the MapLibre→canvas renderer (browser seam)**

Create `web/src/lib/map/groundTexture.ts`:

```ts
import maplibregl, { type StyleSpecification } from "maplibre-gl";

/**
 * Browser/MapLibre seam (not unit-tested): render a static map of `bounds` into
 * an offscreen `size`×`size` canvas and resolve a 2D canvas usable as a
 * THREE.CanvasTexture. The map is non-interactive and removed after one render.
 */
export function renderMapToCanvas(
  style: StyleSpecification,
  bounds: [number, number, number, number],
  size: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    host.style.cssText = `position:absolute;left:-9999px;top:0;width:${size}px;height:${size}px;`;
    document.body.appendChild(host);

    const cleanup = (map: maplibregl.Map) => {
      map.remove();
      host.remove();
    };

    const map = new maplibregl.Map({
      container: host,
      style,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true, // required to read pixels out of the GL canvas
      bounds: [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      fitBoundsOptions: { padding: 0, animate: false },
    });

    let done = false;
    map.on("idle", () => {
      if (done) return;
      done = true;
      try {
        const out = document.createElement("canvas");
        out.width = size;
        out.height = size;
        out.getContext("2d")!.drawImage(map.getCanvas(), 0, 0, size, size);
        cleanup(map);
        resolve(out);
      } catch (e) {
        cleanup(map);
        reject(e);
      }
    });
    map.on("error", (e) => {
      if (done) return;
      done = true;
      cleanup(map);
      reject(e.error ?? new Error("maplibre render error"));
    });
  });
}
```

- [ ] **Step 7: Add the `MAP` config block**

In `web/src/config/explorer.ts`, add this import at the top (after line 1's comment, before `MEMORIES_BASE_URL`):

```ts
import { OSM_STYLE } from "@/lib/map/style";
```

Then append at the end of the file:

```ts
// Faint in-world map laid under the memories, aligned to the same geo projection.
// Styling is config-only (no in-app restyle UI); the explorer toggles visibility.
// `spanMeters` is the ground extent; `opacity`/`tint` make it "barely visible".
export const MAP = {
  enabled: true,
  style: OSM_STYLE,
  spanMeters: 4000,
  textureSize: 2048,
  opacity: 0.18,
  tint: "#3a4a66",
  y: 0,
} as const;
```

- [ ] **Step 8: Create the `MapGround` component**

Create `web/src/components/MapGround.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { CITY, MAP } from "@/config/explorer";
import { groundExtent } from "@/lib/map/extent";
import { renderMapToCanvas } from "@/lib/map/groundTexture";

// Faint Wolfsburg map laid flat under the memories. The texture is rendered once
// from MapLibre and aligned via the same geo projection as the splats. Styling
// comes from MAP (config); only `visible` changes at runtime.
//
// Orientation: MapLibre draws north-up / west-left. Rotating the plane -90° about
// X lays it on the XZ ground; lib/geo/project puts North at -Z and East at +X.
// `texture.flipY = false` + the rotation below align north→-Z; if the map looks
// mirrored or rotated during verification, adjust flipY / the Z rotation here.
export default function MapGround({ visible }: { visible: boolean }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const extent = useMemo(
    () => groundExtent({ lat: CITY.origin_lat, lon: CITY.origin_lon }, MAP.spanMeters),
    [],
  );

  useEffect(() => {
    let disposed = false;
    let tex: THREE.CanvasTexture | null = null;
    renderMapToCanvas(MAP.style, extent.bounds, MAP.textureSize)
      .then((canvas) => {
        if (disposed) return;
        tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        setTexture(tex);
      })
      .catch((e) => console.error("[map] ground texture failed", e));
    return () => {
      disposed = true;
      tex?.dispose();
    };
  }, [extent]);

  if (!texture) return null;
  return (
    <mesh visible={visible} rotation={[-Math.PI / 2, 0, 0]} position={[0, MAP.y, 0]}>
      <planeGeometry args={[extent.size, extent.size]} />
      <meshBasicMaterial
        map={texture}
        color={MAP.tint}
        transparent
        opacity={MAP.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
```

- [ ] **Step 9: Wire the map + visibility toggle into `SplatWorld`**

In `web/src/components/SplatWorld.tsx`:

(a) Add imports (near the other component imports):

```tsx
import MapGround from "@/components/MapGround";
import { MAP } from "@/config/explorer";
```

(b) Add visibility state near the other `useState` hooks (e.g. after `manifestVersion`):

```tsx
  const [mapVisible, setMapVisible] = useState(MAP.enabled);
```

(c) Add an `M`-key toggle. Extend the existing key handler effect (lines 103-118): inside `onKey`, after the `if (e.key === "e" ...)` branch, add an `m` branch. Replace the body of that handler's conditional chain so it reads:

```tsx
      if (e.key === "e" || e.key === "E") {
        setEditMode((on) => !on);
      } else if (e.key === "m" || e.key === "M") {
        setMapVisible((v) => !v);
      } else if (editMode) {
        if (e.key === "g" || e.key === "G") setMode("translate");
        else if (e.key === "r" || e.key === "R") setMode("rotate");
        else if (e.key === "s" || e.key === "S") setMode("scale");
      }
```

(d) Render the ground plane inside the `<Canvas>` (e.g. right after `<CameraPoseProbe />`):

```tsx
        <MapGround visible={mapVisible} />
```

(e) Add a small corner toggle button. In the non-edit-mode chrome block (the `else` branch rendering the `editToggle` button, around lines 201-206), add a second button next to it:

```tsx
        <button
          className={styles.editToggle}
          style={{ top: 56 }}
          onClick={() => setMapVisible((v) => !v)}
        >
          {mapVisible ? "Hide map" : "Show map"}
          <span className={styles.editKbd}>M</span>
        </button>
```

Place this button immediately after the existing `Edit placements` button, still inside the same `else` branch so it only shows in the fly-through chrome.

- [ ] **Step 10: Build + full suite**

Run (from `web/`):
```bash
npm run build && npm test
```
Expected: build succeeds; all specs pass (including `map.extent`).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(web): faint config-styled Wolfsburg map ground plane (M to toggle)"
```

---

## Task 7: Final verification

The WebGL spheres, the MapLibre→texture ground plane, and the route handlers are the manual seams (per the project's TDD-with-isolated-seam convention). Verify on a production build, not dev (HMR remounts the WebGL canvas).

- [ ] **Step 1: Full suite green**

Run (from `web/`):
```bash
npm test
```
Expected: all specs pass, including the four new files (`upload.placement`, `camera.pose`, `pending.select`, `map.extent`).

- [ ] **Step 2: Production build + serve**

Run (from `web/`):
```bash
npm run build && npm run start
```
Open `http://localhost:3000`.

- [ ] **Step 3: Manual checklist**

Verify each:
- The explorer loads the existing seed memories (manifest still parses; no `/contribute` or `/admin` links anywhere).
- Pressing `M` (or the "Hide map / Show map" button) toggles a faint map on the ground under the memories; it is aligned roughly to where memories sit. (If the map looks mirrored/rotated, adjust `flipY` / the Z-rotation note in `MapGround.tsx`.)
- Edit mode still works: press `E`, click a memory, `G/R/S`, drag the gizmo, Save — unchanged.
- Drop a photo **with** EXIF GPS: a wireframe placeholder sphere appears at the real location; the top-right hint shows "Memory added — reconstructing…"; you can keep flying.
- Drop a photo **without** GPS: the sphere appears in front of the current view.
- With the GPU watcher running (`python -m pipeline.watch` in the `sharp` env), the sphere is replaced by the splat automatically once reconstruction publishes (no refresh, no admin step). Without the watcher, the sphere persists (expected).

- [ ] **Step 4: Update project docs**

Edit `web/README.md` and the root `CLAUDE.md` so the S3 description matches the new flow: drop → auto-placement (EXIF GPS or camera-front) → placeholder sphere → watcher ingest auto-approves + publishes → splat appears; `/contribute` and `/admin` removed; explorer has a config-styled, `M`-toggleable map ground plane. Keep edits tight — update the S3 paragraph and the explorer-controls/commands sections; do not rewrite unrelated parts.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(web): document stripped-down drop-to-splat flow + map ground plane"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 pages/routes → Task 1; §2 auto-placement → Tasks 3-4; §3 spheres + refetch → Task 5; §4 auto-approve/publish → Task 2; §5 map ground → Task 6; §6 data contract (no shape change) → upheld in Task 3's record; testing → per-task TDD + Task 7. The "headless backend smoke test" the spec mentions does **not** exist as a Vitest file (verified: no spec imports the routes); route behavior is therefore verified manually in Task 7, consistent with the project's "routes are a manual seam" convention.
- **Type consistency:** `placementTransform(input, origin, standoff)`, `selectPending(records, ids)` / `hasUnpublishedApproved(records, ids)`, `getCameraPose()/setCameraPose()`, `groundExtent(origin, span) → {size, bounds}`, `renderMapToCanvas(style, bounds, size)`, `useManifest(version)` are used with identical signatures everywhere they appear.
- **Config note:** `lib/map/style.ts` uses `import type` for `StyleSpecification`, so adding `MAP` to `config/explorer.ts` does not pull the `maplibre-gl` runtime into the Node route that imports `CITY`.
```
