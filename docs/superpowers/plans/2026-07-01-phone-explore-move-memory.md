# Move-a-memory on the Phone Explore Field — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a curator long-press a memory's name label on the phone `/m` Explore field and drag it to a new spot, sliding the splat live on the projector and persisting the new ground position.

**Architecture:** The phone Explore field (`ExploreField.tsx`) gains a long-press→grab→drag→drop gesture. A drag converts finger→world via a new pure `unproject()` and streams a one-shot `place` WebSocket event; the backend relays it (untied to the drive token) to the projector, where `SplatWorld` folds it into its existing `edits` transform-overlay so the splat + LOD ghost re-place live. On drop, the phone PATCHes the full transform (reusing the desktop editor's endpoint), so the move survives reload. Only world x/z change — height, orientation, and scale are untouched.

**Tech Stack:** Next.js 16 (App Router, static export) + React 19 + React Three Fiber + Spark splats (frontend); FastAPI + WebSockets (backend). Vitest for frontend pure logic, pytest for backend pure logic.

## Global Constraints

- **This is not the Next.js you know** — before writing frontend code, read the relevant guide under `web/node_modules/next/dist/docs/` (per `web/AGENTS.md`). Heed deprecation notices.
- **Icons: Untitled UI only** — any UI icon is a named import from `@untitledui/icons`. No inline SVG, no other icon libs, no emoji glyphs. (This feature adds no new icons.)
- **TDD with the seam isolated** — pure logic (`unproject`, `groundMove`, `parse_place`) is unit-tested; the touch gesture, the WebSocket round-trip, and the live splat slide are manual seams (verified on a phone against a **production build**, `cd web && npm run build && npm run start` — not dev).
- **Frontend pure-logic tests** live in `web/test/*.test.ts` (Vitest, `node` env, `@` alias → `web/src`). **Backend pure-logic tests** live in `backend/tests/*.py` (pytest, run via `.\.venv\Scripts\python.exe -m pytest`).
- **Move changes ground plane only:** world x (`position[0]`) and z (`position[2]`). `position[1]` (height), `quaternion`, and `scale` are preserved verbatim.
- **`place` is independent of the single-driver token** — moving a memory is curation, orthogonal to who drives the camera. Do NOT route it through `Controller.set_state`.
- **No undo, auto-save on drop** (matches the desktop editor's no-Save-button convention).

---

### Task 1: Pure `unproject()` — screen px → world x/z

Inverse of the existing `project()` affine in the minimap module, so the phone can turn a finger position into a world ground coordinate.

**Files:**
- Modify: `web/src/lib/explore/minimap.ts` (add `unproject`, after `project`)
- Test: `web/test/explore.minimap.test.ts` (append)

**Interfaces:**
- Consumes: `MinimapView`, `ScreenPoint`, `WorldPoint`, `project` (all already exported from `minimap.ts`).
- Produces: `unproject(screen: ScreenPoint, view: MinimapView): WorldPoint` — returns `{ x, z }` in world metres; exact inverse of `project`. Guards `scale === 0` by returning the view centre.

- [ ] **Step 1: Write the failing test**

Append to `web/test/explore.minimap.test.ts`:

```ts
import { worldBounds, fitView, project, unproject, clampZoom, zoomAboutPoint } from "@/lib/explore/minimap";

describe("unproject", () => {
  it("round-trips with project across pan/zoom", () => {
    const base = fitView({ minX: -40, maxX: 60, minZ: -30, maxZ: 90 }, 375, 700);
    const view = { ...base, scale: base.scale * 2.5, panX: 37, panY: -18 };
    for (const w of [
      { x: 0, z: 0 },
      { x: -40, z: 90 },
      { x: 60, z: -30 },
      { x: 12.5, z: 7.25 },
    ]) {
      const back = unproject(project(w.x, w.z, view), view);
      expect(back.x).toBeCloseTo(w.x, 6);
      expect(back.z).toBeCloseTo(w.z, 6);
    }
  });

  it("maps the viewport centre to the view centre (zero pan)", () => {
    const view = fitView({ minX: 0, maxX: 100, minZ: -50, maxZ: 50 }, 300, 600);
    const w = unproject({ x: 150, y: 300 }, view);
    expect(w.x).toBeCloseTo(view.centerX, 6);
    expect(w.z).toBeCloseTo(view.centerZ, 6);
  });

  it("returns the view centre when scale is zero", () => {
    const view = { scale: 0, centerX: 5, centerZ: -7, panX: 0, panY: 0, width: 200, height: 200 };
    expect(unproject({ x: 123, y: 45 }, view)).toEqual({ x: 5, z: -7 });
  });
});
```

Update the existing top import line of the file to include `unproject` (shown above — replace the current `import { worldBounds, fitView, project, clampZoom, zoomAboutPoint } ...` line).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/explore.minimap.test.ts`
Expected: FAIL — `unproject is not a function` (or an import/export error).

- [ ] **Step 3: Write minimal implementation**

In `web/src/lib/explore/minimap.ts`, immediately after the `project` function (after line ~106):

```ts
/** Inverse of `project`: screen px → world point under `view`. The exact
 *  algebraic inverse of the affine in `project`; returns the view centre if
 *  `scale` is 0 (degenerate view, never produced by `fitView`). */
export function unproject(screen: ScreenPoint, view: MinimapView): WorldPoint {
  if (view.scale === 0) return { x: view.centerX, z: view.centerZ };
  return {
    x: (screen.x - view.width / 2 - view.panX) / view.scale + view.centerX,
    z: (screen.y - view.height / 2 - view.panY) / view.scale + view.centerZ,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/explore.minimap.test.ts`
Expected: PASS (all `unproject` cases + the pre-existing minimap cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/explore/minimap.ts web/test/explore.minimap.test.ts
git commit -m "feat(web/m): add unproject (screen->world) to the Explore minimap"
```

---

### Task 2: Pure `groundMove()` — merge a new x/z into a memory's transform

Both the phone (to PATCH) and the projector (to build the live overlay edit) need to take a memory's stored `Transform` and replace only its ground x/z, producing a `StoredTransform` (scalar scale) the PATCH endpoint accepts. `is_valid_transform` requires `scale` to be a **positive number**, but a manifest record's `transform.scale` may be a `Vec3` (e.g. seeds store `[1,1,1]`) — so this helper collapses an array scale to its first component (splats are uniformly scaled).

**Files:**
- Create: `web/src/lib/transform/place.ts`
- Test: `web/test/transform.place.test.ts`

**Interfaces:**
- Consumes: `Transform` (from `@/lib/manifest/types`), `StoredTransform` (from `@/lib/transform/apply`).
- Produces: `groundMove(t: Transform, x: number, z: number): StoredTransform` — `{ position: [x, t.position[1], z], quaternion: t.quaternion, scale: <scalar> }`, where a `Vec3` scale is collapsed to `scale[0]`.

- [ ] **Step 1: Write the failing test**

Create `web/test/transform.place.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groundMove } from "@/lib/transform/place";
import type { Transform } from "@/lib/manifest/types";

const base: Transform = {
  position: [10, 4, -6],
  quaternion: [0, 0.7071, 0, 0.7071],
  scale: [2, 2, 2],
};

describe("groundMove", () => {
  it("replaces only x and z, preserving height", () => {
    const t = groundMove(base, 25, -13);
    expect(t.position).toEqual([25, 4, -13]);
  });

  it("preserves the quaternion", () => {
    expect(groundMove(base, 0, 0).quaternion).toEqual([0, 0.7071, 0, 0.7071]);
  });

  it("collapses a Vec3 scale to its first component (scalar)", () => {
    expect(groundMove(base, 0, 0).scale).toBe(2);
  });

  it("passes a scalar scale through unchanged", () => {
    const t: Transform = { ...base, scale: 3 };
    expect(groundMove(t, 0, 0).scale).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run test/transform.place.test.ts`
Expected: FAIL — cannot resolve `@/lib/transform/place`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/lib/transform/place.ts`:

```ts
import type { Transform } from "@/lib/manifest/types";
import type { StoredTransform } from "@/lib/transform/apply";

// Move a memory on the ground plane: return a StoredTransform with its x/z
// replaced by the drop position and everything else (height, orientation,
// scale) preserved. Scale is collapsed to a scalar because the PATCH endpoint
// (`is_valid_transform`) requires a positive number, while a manifest record's
// scale may be a Vec3 (seeds store [1,1,1]); splats are uniformly scaled, so
// scale[0] is the faithful scalar. Shared by the phone (persist) and the
// projector (live overlay edit).
export function groundMove(t: Transform, x: number, z: number): StoredTransform {
  return {
    position: [x, t.position[1], z],
    quaternion: t.quaternion,
    scale: Array.isArray(t.scale) ? t.scale[0] : t.scale,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run test/transform.place.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/transform/place.ts web/test/transform.place.test.ts
git commit -m "feat(web): add groundMove transform helper (replace x/z, scalar scale)"
```

---

### Task 3: Backend `parse_place()` + WebSocket relay

Validate an untrusted `place` event and relay it to the projector display(s). Modelled on the existing `_parse_filter` validator and the `jump`/`recenter`/`filter` broadcasts — but handled as its **own top-level message type**, not routed through `Controller.set_state`, so a move never claims or resets the drive token.

**Files:**
- Modify: `backend/control.py` (add `parse_place`, near `_parse_filter`, ~line 66)
- Modify: `backend/app.py` (import `parse_place`; add a `place` branch in the controller receive loop, ~line 321)
- Test: `backend/tests/test_control.py` (append a `TestParsePlace` class)

**Interfaces:**
- Consumes: `_finite` (already in `backend/control.py`).
- Produces: `parse_place(raw) -> dict | None` — `{"id": str, "x": float, "z": float}` when `id` is a non-empty string and `x`,`z` are finite numbers; otherwise `None`.
- Wire (seam): a controller message `{"type": "place", "id", "x", "z"}` is broadcast to displays verbatim as `{"type": "place", "id", "x", "z"}`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_control.py`:

```python
from backend.control import parse_place


class TestParsePlace:
    def test_keeps_valid_move(self):
        assert parse_place({"id": " mem-01 ", "x": 12.5, "z": -3}) == {
            "id": "mem-01",
            "x": 12.5,
            "z": -3.0,
        }

    def test_drops_empty_or_non_string_id(self):
        assert parse_place({"id": "", "x": 1, "z": 2}) is None
        assert parse_place({"id": 5, "x": 1, "z": 2}) is None
        assert parse_place({"x": 1, "z": 2}) is None

    def test_drops_non_finite_coords(self):
        assert parse_place({"id": "m", "x": float("nan"), "z": 0}) is None
        assert parse_place({"id": "m", "x": 0, "z": float("inf")}) is None
        assert parse_place({"id": "m", "x": True, "z": 0}) is None
        assert parse_place({"id": "m", "z": 0}) is None

    def test_non_dict_is_none(self):
        assert parse_place(None) is None
        assert parse_place([1, 2, 3]) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_control.py::TestParsePlace -v`
Expected: FAIL — `ImportError: cannot import name 'parse_place'`.

- [ ] **Step 3: Write minimal implementation (validator)**

In `backend/control.py`, after `_parse_filter` (after line ~65):

```python
def parse_place(raw):
    """Validate a memory-move event ``{id, x, z}`` (id a non-empty string, x/z
    finite numbers). Returns ``{"id", "x", "z"}`` or ``None`` if anything is
    missing/invalid — a half-valid move would drop the memory at a bogus ground
    position. Handled as a standalone event, independent of the drive token."""
    if not isinstance(raw, dict):
        return None
    mid = raw.get("id")
    if not isinstance(mid, str) or not mid.strip():
        return None
    if not _finite(raw.get("x")) or not _finite(raw.get("z")):
        return None
    return {"id": mid.strip(), "x": float(raw["x"]), "z": float(raw["z"])}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_control.py::TestParsePlace -v`
Expected: PASS (4 cases).

- [ ] **Step 5: Wire the WebSocket relay**

In `backend/app.py`, extend the control-import line (~line 29):

```python
from .control import Controller, parse_control_state, parse_place
```

Then in the controller receive loop, add a branch **after** the `elif mtype == "state":` block (after line ~321, before the `except WebSocketDisconnect:`):

```python
            elif mtype == "place":
                # Curation, not driving: relay a memory-move to the display(s)
                # without touching the single-driver token or the control state.
                parsed = parse_place(msg)
                if parsed is not None:
                    await _broadcast(
                        {"type": "place", "id": parsed["id"], "x": parsed["x"], "z": parsed["z"]}
                    )
```

- [ ] **Step 6: Run the full backend suite**

Run: `.\.venv\Scripts\python.exe -m pytest backend/tests/test_control.py -v`
Expected: PASS (all existing control tests + `TestParsePlace`).

- [ ] **Step 7: Commit**

```bash
git add backend/control.py backend/app.py backend/tests/test_control.py
git commit -m "feat(backend): parse + relay a token-independent 'place' memory-move event"
```

---

### Task 4: Projector applies a remote `place` live (edits overlay)

The projector's `RemoteControlClient` (DOM side) learns the `place` message and forwards it via an `onPlace` callback, mirroring `onJump`/`onFilter`. `SplatWorld` handles it by folding the moved transform into its existing `edits` overlay — which drives `Memories`' re-place effect, sliding both the resident splat and its ghost live. No live-mesh manipulation, no new module.

**Files:**
- Modify: `web/src/components/RemoteControlClient.tsx` (add `onPlace` prop + `place` message handling)
- Modify: `web/src/components/SplatWorld.tsx` (add `handleRemotePlace`; pass to `RemoteControlClient`)

**Interfaces:**
- Consumes: `groundMove` (Task 2); `setEdits` state setter and `recordsRef` (both already in `SplatWorld.tsx`); the `edits`/`applyEdits` overlay (already present).
- Produces: `RemoteControlClient` prop `onPlace?: (id: string, x: number, z: number) => void`, invoked on a valid `{type:"place", id, x, z}` frame.

- [ ] **Step 1: Add `onPlace` to RemoteControlClient**

In `web/src/components/RemoteControlClient.tsx`, extend the props type (after `onFilter`, ~line 17):

```tsx
export default function RemoteControlClient({
  onJump,
  onFilter,
  onPlace,
}: {
  onJump: (target: string) => void;
  /** A timeline year-range from the phone: show only memories captured within it. */
  onFilter?: (from: number, to: number) => void;
  /** A memory-move from the phone Explore field: slide memory `id` to world x/z. */
  onPlace?: (id: string, x: number, z: number) => void;
}) {
```

Add a handler branch inside `ws.onmessage`, after the `filter` branch (after line ~47):

```tsx
          } else if (
            msg.type === "place" &&
            typeof msg.id === "string" &&
            typeof msg.x === "number" &&
            typeof msg.z === "number"
          ) {
            onPlace?.(msg.id, msg.x, msg.z);
          }
```

Add `onPlace` to the effect's dependency array (the array currently `[onJump, onFilter]`, ~line 66):

```tsx
  }, [onJump, onFilter, onPlace]);
```

- [ ] **Step 2: Handle it in SplatWorld**

In `web/src/components/SplatWorld.tsx`, add the import (near the other `@/lib/transform` imports, ~line 23):

```tsx
import { groundMove } from "@/lib/transform/place";
```

Add the handler next to `handleRemoteJump` (after the `handleRemoteJump` `useCallback`, ~line 108). It reads the latest applied records via the existing `recordsRef` and folds the moved transform into `edits`:

```tsx
  // A memory-move streamed from the phone Explore field: slide the memory to the
  // new ground x/z live by folding it into the edits overlay (drives Memories'
  // re-place effect for both the splat and its ghost). The phone owns persistence
  // (its own PATCH), so this is display-only — no write here.
  const handleRemotePlace = useCallback((id: string, x: number, z: number) => {
    const rec = recordsRef.current.find((r) => r.id === id);
    if (!rec) return;
    setEdits((e) => ({ ...e, [id]: groundMove(rec.transform, x, z) }));
  }, []);
```

Pass it to the mounted `RemoteControlClient` (~line 341):

```tsx
      <RemoteControlClient onJump={handleRemoteJump} onFilter={handleFilter} onPlace={handleRemotePlace} />
```

- [ ] **Step 3: Typecheck + full frontend suite**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors; all existing specs plus Tasks 1–2 green.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/RemoteControlClient.tsx web/src/components/SplatWorld.tsx
git commit -m "feat(web): projector slides a memory live on a remote 'place' event"
```

---

### Task 5: Phone Explore — long-press grab, drag, drop

Add the gesture to `ExploreField.tsx`: press-and-hold ~400 ms on a label to grab it (haptic + lifted style), drag to move (suppressing field pan, streaming throttled `place`), release to drop (final `place` + PATCH + optimistic local override so the label stays put). A quick tap still travels; a plain drag still pans; pinch still zooms.

**Files:**
- Modify: `web/src/app/m/ExploreField.tsx` (gesture state machine + label handlers)
- Modify: `web/src/app/m/mobile.module.css` (add `.memoryLabelGrabbed`)

**Interfaces:**
- Consumes: `unproject` (Task 1), `groundMove` (Task 2), `project`/`fitView`/`worldBounds` (existing), `getApiBaseUrl` (from `@/lib/api/baseUrl`), `useControlSocket().send` (existing).
- Produces: no exports; a self-contained interaction. Emits `send({ type: "place", id, x, z })` frames during drag and on drop, and `PATCH ${getApiBaseUrl()}/api/memories/${id}/transform` on drop.

- [ ] **Step 1: Add the grabbed-label style**

In `web/src/app/m/mobile.module.css`, after the `.memoryLabelDim` block (after line ~433):

```css
.memoryLabelGrabbed {
  z-index: 10;
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.28);
  color: rgb(var(--ink));
  text-shadow: 0 6px 18px rgb(0 0 0 / 0.35);
  cursor: grabbing;
}
```

- [ ] **Step 2: Rewrite `ExploreField.tsx` with the gesture**

Replace the entire contents of `web/src/app/m/ExploreField.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useControlSocket } from "@/hooks/useControlSocket";
import {
  clampZoom,
  fitView,
  project,
  unproject,
  worldBounds,
  zoomAboutPoint,
} from "@/lib/explore/minimap";
import { groundMove } from "@/lib/transform/place";
import { getApiBaseUrl } from "@/lib/api/baseUrl";
import { isVisibleInRange, memoryYear, type TimeRange } from "@/lib/explore/timeline";
import type { MemoryRecord } from "@/lib/manifest/types";
import styles from "./mobile.module.css";

// 5b Explore: the shadow field IS the city. Each memory floats as a serif name label
// at its real place — a north-up top-down minimap of the memories' world positions
// (transform x/z). Drag empty space to pan; pinch (or wheel) to zoom toward the
// fingers; tap a label to fly the projector there. Long-press a label (~400ms) to
// grab it, then drag to reposition it on the ground plane: the move streams live to
// the projector (a `place` control event) and persists on release (PATCH transform).
// The shared timeline range dims memories outside the active window.
const DRAG_THRESHOLD = 6; // px of travel before a press counts as a pan, not a tap
const ZOOM_MIN = 0.6; // multiplier on the fit-to-content base scale
const ZOOM_MAX = 12;
const WHEEL_SENS = 0.0015; // px of deltaY → zoom-factor exponent
const GRAB_MS = 400; // press-and-hold before a label is picked up
const PLACE_THROTTLE_MS = 50; // ~20 Hz cap on live move events during a drag

function labelFor(rec: MemoryRecord): string {
  if (rec.name?.trim()) return rec.name.trim();
  const year = memoryYear(rec);
  return year !== null ? String(year) : "A memory";
}

export default function ExploreField({
  records,
  range,
}: {
  records: MemoryRecord[];
  range: TimeRange | null;
}) {
  const { send } = useControlSocket();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // Refs mirror pan/zoom so gesture handlers read the freshest value (a burst of
  // pointer events can fire before React re-renders the closed-over state).
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const apply = (p: { x: number; y: number }, z: number) => {
    panRef.current = p;
    zoomRef.current = z;
    setPan(p);
    setZoom(z);
  };
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(
    null,
  );
  // Live pointers on the surface, and the pinch anchor (base distance + zoom at the
  // two-finger touch-down).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // --- Move-a-memory gesture state -------------------------------------------
  // A press on a label starts a candidate; after GRAB_MS (finger still down and
  // un-moved) it promotes to an active grab that owns its pointer. `overrides`
  // holds dropped positions optimistically until the (session-static) read model
  // would otherwise re-place the label at its stale spot. `didGrab` suppresses the
  // label's click-to-travel after a grab. `lastSent` throttles the live stream.
  const grabCand = useRef<{ id: string; pointerId: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const grab = useRef<{ id: string; pointerId: number } | null>(null);
  const didGrab = useRef(false);
  const lastSent = useRef(0);
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [livePos, setLivePos] = useState<{ x: number; z: number } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { x: number; z: number }>>({});

  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const points = useMemo(
    () =>
      records.map((r) => {
        const o = overrides[r.id];
        return { x: o?.x ?? r.transform.position[0], z: o?.z ?? r.transform.position[2] };
      }),
    [records, overrides],
  );
  const view = useMemo(() => {
    const base = fitView(worldBounds(points), size.w, size.h);
    return { ...base, scale: base.scale * zoom, panX: pan.x, panY: pan.y };
  }, [points, size.w, size.h, pan.x, pan.y, zoom]);
  // Read the freshest view inside pointer handlers without re-binding them.
  const viewRef = useRef(view);
  viewRef.current = view;
  const recordsRef = useRef(records);
  recordsRef.current = records;

  const clearGrabCandidate = () => {
    if (grabCand.current) {
      clearTimeout(grabCand.current.timer);
      grabCand.current = null;
    }
  };

  const twoFingers = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
    const pts = [...pointers.current.values()];
    return pts.length >= 2 ? [pts[0], pts[1]] : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const two = twoFingers();
    if (two) {
      // Second finger down → start a pinch; cancel any single-finger pan/grab.
      drag.current = null;
      clearGrabCandidate();
      pinch.current = { dist: Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y), zoom: zoomRef.current };
    } else {
      drag.current = { startX: e.clientX, startY: e.clientY, baseX: panRef.current.x, baseY: panRef.current.y, moved: false };
    }
  };

  // A press that started on a label: arm the long-press timer. The surface's
  // onPointerDown still runs (bubbling) and arms a pan — the timer cancels that
  // pan if it fires; a move past threshold before then cancels the timer instead.
  const onLabelPointerDown = (e: React.PointerEvent, id: string) => {
    didGrab.current = false;
    clearGrabCandidate();
    const pointerId = e.pointerId;
    const timer = setTimeout(() => {
      grabCand.current = null;
      grab.current = { id, pointerId };
      drag.current = null; // stop the field from panning under the grab
      didGrab.current = true;
      const rec = recordsRef.current.find((r) => r.id === id);
      if (rec) {
        const o = overrides[id];
        setLivePos({ x: o?.x ?? rec.transform.position[0], z: o?.z ?? rec.transform.position[2] });
      }
      setGrabbedId(id);
      navigator.vibrate?.(15);
    }, GRAB_MS);
    grabCand.current = { id, pointerId, timer };
  };

  const streamPlace = (id: string, x: number, z: number) => {
    const now = Date.now();
    if (now - lastSent.current < PLACE_THROTTLE_MS) return;
    lastSent.current = now;
    send({ type: "place", id, x, z });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = pointers.current.get(e.pointerId);
    if (pt) {
      pt.x = e.clientX;
      pt.y = e.clientY;
    }

    // Active grab: move the label, suppress pan/pinch, stream the live position.
    const g = grab.current;
    if (g && g.pointerId === e.pointerId) {
      const w = unproject({ x: e.clientX, y: e.clientY }, viewRef.current);
      setLivePos(w);
      streamPlace(g.id, w.x, w.z);
      return;
    }

    // Candidate grab not yet promoted: a move past threshold means the user is
    // panning, not holding — cancel the long-press and let the pan proceed.
    const cand = grabCand.current;
    if (cand && cand.pointerId === e.pointerId) {
      const d0 = drag.current;
      if (d0 && Math.hypot(e.clientX - d0.startX, e.clientY - d0.startY) > DRAG_THRESHOLD) {
        clearGrabCandidate();
      }
    }

    const two = twoFingers();
    if (pinch.current && two) {
      const dist = Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y);
      if (pinch.current.dist > 0) {
        const next = clampZoom(pinch.current.zoom * (dist / pinch.current.dist), ZOOM_MIN, ZOOM_MAX);
        const focal = { x: (two[0].x + two[1].x) / 2, y: (two[0].y + two[1].y) / 2 };
        apply(zoomAboutPoint(panRef.current, focal, { width: size.w, height: size.h }, zoomRef.current, next), next);
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
    if (d.moved) apply({ x: d.baseX + dx, y: d.baseY + dy }, zoomRef.current);
  };

  const dropMemory = (id: string, x: number, z: number) => {
    const rec = recordsRef.current.find((r) => r.id === id);
    setOverrides((o) => ({ ...o, [id]: { x, z } }));
    send({ type: "place", id, x, z }); // final, unthrottled — land exactly here
    if (rec) {
      void fetch(`${getApiBaseUrl()}/api/memories/${id}/transform`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transform: groundMove(rec.transform, x, z) }),
      }).catch(() => {
        /* offline / backend down — the override keeps the on-screen move */
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    clearGrabCandidate();

    // Release an active grab → drop the memory here.
    const g = grab.current;
    if (g && g.pointerId === e.pointerId) {
      const w = unproject({ x: e.clientX, y: e.clientY }, viewRef.current);
      dropMemory(g.id, w.x, w.z);
      grab.current = null;
      setGrabbedId(null);
      setLivePos(null);
      return;
    }

    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      // One finger remains after a pinch — hand off to a pan from where it is (moved,
      // so lifting it never fires a stray tap-to-travel).
      const [only] = [...pointers.current.values()];
      drag.current = { startX: only.x, startY: only.y, baseX: panRef.current.x, baseY: panRef.current.y, moved: true };
    } else if (pointers.current.size === 0) {
      drag.current = null;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const next = clampZoom(zoomRef.current * Math.exp(-e.deltaY * WHEEL_SENS), ZOOM_MIN, ZOOM_MAX);
    apply(
      zoomAboutPoint(panRef.current, { x: e.clientX, y: e.clientY }, { width: size.w, height: size.h }, zoomRef.current, next),
      next,
    );
  };

  const travelTo = (rec: MemoryRecord) => {
    // A pan gesture or a just-completed grab shouldn't also fire the tapped label.
    if (drag.current?.moved || didGrab.current) return;
    send({ type: "state", move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, jump: rec.id });
  };

  return (
    <div
      className={styles.exploreSurface}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {records.length === 0 && (
        <p className={styles.exploreEmpty}>No memories yet</p>
      )}
      {records.map((rec) => {
        const grabbing = grabbedId === rec.id;
        const o = overrides[rec.id];
        const wx = grabbing && livePos ? livePos.x : o?.x ?? rec.transform.position[0];
        const wz = grabbing && livePos ? livePos.z : o?.z ?? rec.transform.position[2];
        const p = project(wx, wz, view);
        const visible = isVisibleInRange(rec, range);
        return (
          <button
            key={rec.id}
            type="button"
            className={`${styles.memoryLabel} ${grabbing ? styles.memoryLabelGrabbed : visible ? "" : styles.memoryLabelDim}`}
            style={{ left: p.x, top: p.y }}
            onPointerDown={(e) => onLabelPointerDown(e, rec.id)}
            onClick={() => travelTo(rec)}
          >
            {labelFor(rec)}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + full frontend suite**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors; all specs green (the gesture itself has no unit test; it's the manual seam).

- [ ] **Step 4: Commit**

```bash
git add web/src/app/m/ExploreField.tsx web/src/app/m/mobile.module.css
git commit -m "feat(web/m): long-press a memory in Explore to drag it to a new place"
```

---

### Task 6: Manual seam verification (production build, on a phone)

The gesture, WebSocket round-trip, live splat slide, and persistence are the mocked/manual seams the repo does not unit-test. Verify them end-to-end.

**Files:** none (verification only).

- [ ] **Step 1: Start the backend (real relay)**

Run (in the `sharp` conda env): `uvicorn backend.app:app --port 8000`

- [ ] **Step 2: Build + serve the frontend production build**

Run: `cd web && npm run build && npm run start`
(Verify on the production build — dev HMR remounts the WebGL viewer and throws spurious errors.)

- [ ] **Step 3: Open the projector + the phone**

- Projector: open the explorer (`/`) on the desktop/projector browser.
- Phone: open `/m`, switch to **Explore**. Confirm the name labels appear as a top-down map.

- [ ] **Step 4: Verify the move**

1. **Long-press** a label (~0.4 s) → it lifts (scales up, brightens) and the phone buzzes.
2. **Drag** it across the map → the label follows your finger, and on the **projector** that memory's splat (and its ghost) **slides live** to the new place.
3. **Release** → the label stays at the drop spot; the projector splat rests there.
4. **Tap** a different label → the projector still **flies** there (travel unbroken).
5. **Drag empty space** → the field still **pans**; **pinch** → still zooms.
6. **Reload the projector** (`/`) → the moved memory loads at its **new** position (persistence via PATCH → republished manifest).

- [ ] **Step 5: Commit (docs only, if notes were taken)**

No code change expected. If the spec/plan needed a correction, commit it:

```bash
git add docs/superpowers/
git commit -m "docs: note manual-verification results for phone move-a-memory"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-01-phone-explore-move-memory-design.md`):
- Long-press ~400 ms → grab, haptic, lifted style → Task 5 (`GRAB_MS`, `navigator.vibrate`, `.memoryLabelGrabbed`). ✓
- Drag moves world x/z only; height/heading/scale preserved → Task 2 (`groundMove`) + Task 5. ✓
- Cancel-before-grab when finger moves past `DRAG_THRESHOLD` → Task 5 (`onPointerMove` candidate branch). ✓
- Live slide on projector via `place` event + edits overlay (both splat & ghost) → Tasks 3, 4; verified in Task 6. ✓
- `place` independent of the drive token → Task 3 (standalone `elif mtype == "place"`, not via `set_state`). ✓
- Persist full transform via `PATCH /api/memories/:id/transform`; survives reload → Task 5 `dropMemory` + Task 6 step 4.6. ✓
- Optimistic local override until read model reconciles → Task 5 (`overrides`). ✓
- Preserved tap-to-travel / pan / pinch → Task 5 (`travelTo` guard, drag/pinch untouched); verified Task 6 steps 4.4–4.5. ✓
- Pure `unproject` round-trip (Vitest) + `parse_place` (pytest) + transform-merge (Vitest) → Tasks 1, 2, 3. ✓
- Throttle the live stream (~15–20 Hz) → Task 5 (`PLACE_THROTTLE_MS = 50`). ✓

**Deviation from spec (intentional simplification):** the spec described a `placeBridge` module mirroring `remoteInput.ts`. Verified during planning that a remote `place` maps to React state (`setEdits` on the DOM side), not per-frame camera integration inside the Canvas — so it reuses the existing `onJump`/`onFilter` callback pattern instead. No bridge module. Behaviour is identical; one fewer module.

**Placeholder scan:** no TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `groundMove(t: Transform, x, z): StoredTransform` defined in Task 2, consumed with that exact signature in Tasks 4 (`SplatWorld`) and 5 (`ExploreField`). `unproject(screen: ScreenPoint, view: MinimapView): WorldPoint` defined Task 1, consumed Task 5. `parse_place(raw) -> dict|None` defined Task 3, relayed same-shape. `onPlace?: (id, x, z) => void` defined Task 4 (RemoteControlClient), supplied by `handleRemotePlace` (same arity) in SplatWorld. ✓
