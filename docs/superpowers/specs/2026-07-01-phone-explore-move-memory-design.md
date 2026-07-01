# Design — Move a memory from the phone Explore field

**Date:** 2026-07-01
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** `/m` Explore screen (`web/src/app/m/ExploreField.tsx`) + control channel + projector

## Problem

The phone `/m` **Explore** screen is a north-up top-down minimap: each memory floats
as a serif **name label** at its real ground position (world `x`/`z` projected to
screen). Today you can **tap** a label to fly the projector there, **drag** empty
space to pan, and **pinch** to zoom — but there is no way to *reposition* a memory
from the phone. The only placement tool is the desktop explorer's edit-mode gizmo.

We want: **long-press a name label, then drag it to a new spot on the map to change
its ground position**, with the change appearing live on the projector and persisting.

## Goals

- Long-press a label to "grab" it, drag to move, release to drop.
- Moving changes the memory's world **x** and **z** (the map's ground plane) only.
- The memory's splat (and its LOD ghost) **slides live on the projector** as you drag.
- The new position **persists** (survives reload / manifest republish).
- Existing gestures are preserved: tap-to-travel, drag-to-pan, pinch-to-zoom.

## Non-goals (YAGNI)

- No change to **height (y)**, **heading/quaternion**, or **scale** from the phone —
  those stay the desktop gizmo's job. This is coarse ground placement.
- No **undo** — drop auto-saves, matching the desktop editor's no-save-button
  convention. Re-grab and move again to correct.
- No **arrange mode** toggle — grabbing is a per-label long-press, not a global mode.
- The projector **camera does not follow** a moved memory.
- No **multi-driver contention** handling for moves (solo installation).

## UX

**Enter move:** press-and-hold ~**400 ms** on a label. On fire:
- `navigator.vibrate(...)` haptic buzz (where supported).
- The label enters a **grabbed** visual state (`.memoryLabelGrabbed`): scaled up,
  brightened, drop-shadow — reads as "lifted off the map".

**Drag:** while grabbed, the label follows the finger. The field **does not pan** for
that pointer (the grab owns it). Screen position is converted to a world position via
`unproject` (below).

**Cancel-before-grab:** if the finger travels past the existing `DRAG_THRESHOLD`
(6 px) *before* the 400 ms timer fires, the timer is cancelled and the gesture falls
through to a normal **pan** — a fast flick never accidentally grabs.

**Drop (release):** the label settles at the finger's world position. This:
1. Sends a final `place` event over the control WebSocket.
2. `PATCH`es the memory's full transform to persist.
3. Keeps an **optimistic local override** of the label's position until the next
   `useMemories` poll returns the saved value (so the label doesn't snap back for a
   frame).

**Preserved:** a quick tap (no long-press, no move) still fires `travelTo`
(fly-to-projector). A drag on empty space still pans. Pinch still zooms.

## Architecture & data flow

```
phone ExploreField                                     projector
──────────────────                                     ─────────
long-press 400ms → grab label
   │
drag ─► unproject(finger, view) → {x, z}
   │        │
   │        ├─ throttled  WS: {type:"place", id, x, z} ─► backend relay ─► RemoteControlClient
   │        │                                                                  │ setPlace({id,x,z})
   │        │                                                             placeBridge (module)
   │        │                                                                  │
   │        │                                                             SplatWorld reads bridge
   │        │                                                             → setEdits(id → transform)
   │        │                                                             → applyEdits() moves splat
   │        │                                                                & preview ghost live
release ────┴─ PATCH /api/memories/:id/transform  ─────────────────────────────────────────────►
                 body: full transform (record y/quat/scale + new x,z)
               → services.update_record_locked + publish_manifest (survives reload)
```

**Why `place` is a standalone one-shot event (not held control state):** it mirrors the
existing `jump` / `recenter` / `filter` events, which the backend relays to the display
without touching the single-driver `Controller` token. Moving a memory is **curation**,
orthogonal to who is currently driving the camera, so it must not claim or disturb the
drive token.

**Why the projector reuses `SplatWorld.edits`:** that overlay already exists to keep
in-session transform edits from being reverted by the LOD rebuild loop, and it stacks on
top of manifest refetches. Feeding a remote `place` into `edits[id]` gives a live move of
both the full `SplatMesh` and the preview point-cloud ghost for free — the same path the
desktop gizmo uses.

**Why PATCH sends the full transform:** the backend `patch_transform` route validates a
complete `{position, quaternion, scale}` via `is_valid_transform`. The phone assembles it
from the record's existing `transform` with `position[0]`/`position[2]` replaced by the
new `x`/`z` (keeping `position[1]`, quaternion, scale). On success the route updates the
store and republishes the manifest, so the move survives reload.

## Components & changes

### New / modified — pure logic (unit-tested)

1. **`web/src/lib/explore/minimap.ts` — add `unproject(screen, view)`**
   Exact inverse of the existing `project()` affine:
   ```
   x = (screen.x - view.width/2 - view.panX) / view.scale + view.centerX
   z = (screen.y - view.height/2 - view.panY) / view.scale + view.centerZ
   ```
   Returns `{ x, z }`. Vitest: `unproject(project(p)) ≈ p` round-trip across views
   (pan/zoom variations), plus the degenerate `scale` guard.

2. **`backend/control.py` — add `parse_place(raw)`**
   Validate `{ id: non-empty str, x: finite, z: finite }`; drop the whole event if any
   field is invalid (mirrors `_parse_filter` / `_parse_aim`). Wire into the message
   relay so a `place` frame is forwarded to the display. pytest for valid / missing-id /
   non-finite / non-dict cases.

3. **Transform-merge helper** (small pure fn, e.g. in `web/src/lib/transform/` or inline
   tested util): given a `MemoryRecord.transform` + new `x`,`z`, return a `StoredTransform`
   with `position = [x, position[1], z]`, quaternion & scale unchanged. Vitest.

### New / modified — seams (manual verification, matches repo convention)

4. **`web/src/lib/control/placeBridge.ts`** — module bridge (mirrors `remoteInput.ts`):
   `setPlace({id,x,z} | null)` / `getPlace()`. Projector DOM side writes; `SplatWorld`
   reads each render/poll.

5. **`web/src/components/RemoteControlClient.tsx`** — handle `msg.type === "place"`:
   validate shape, call `setPlace(...)`. (Also forward via a prop callback so
   `SplatWorld` can react, consistent with `onJump`/`onFilter`.)

6. **`web/src/components/SplatWorld.tsx`** — on a received `place`, build the merged
   transform for that id and `setEdits(e => ({...e, [id]: merged}))`. No new persistence
   here — the phone owns the PATCH.

7. **`web/src/app/m/ExploreField.tsx`** — the long-press/grab/drag state machine:
   - Per-label `onPointerDown` starts a 400 ms grab timer; cancel on move-past-threshold
     or early `pointerup`.
   - While grabbed: track the pointer, suppress pan, send throttled `place`
     (`send({ type: "place", id, x, z })`), render the label at the finger.
   - On `pointerup` while grabbed: final `place`, PATCH the full transform, set an
     optimistic local override `Map<id, {x,z}>` consumed by the projection until the
     next poll.
   - `travelTo` guard extended so a grab/drop never also fires tap-to-travel.

8. **`web/src/app/m/mobile.module.css`** — `.memoryLabelGrabbed` lifted style.

## Testing

| Layer | What | How |
|---|---|---|
| Pure | `unproject` round-trip + scale guard | Vitest |
| Pure | transform-merge (x,z into record transform) | Vitest |
| Pure | `parse_place` validation | pytest |
| Seam | long-press → grab → drag → drop gesture | manual on phone |
| Seam | `place` WS round-trip phone→backend→projector | manual |
| Seam | live splat + ghost slide on projector; persists on reload | manual (prod build) |

## Risks / notes

- **Throttle** the drag `place` sends (~15–20 Hz, matching the drive stream) so a fast
  drag doesn't flood the socket.
- **Optimistic override** must clear once the poll reflects the saved position, or a
  later server-side change wouldn't show. Clear when the polled `x,z` ≈ the override.
- The projector's `edits` overlay already survives manifest refetches; confirm the
  remote `place` path sets it the same way the gizmo does (same `StoredTransform` shape).
- Long-press must not conflict with the browser's native touch-callout / context menu on
  the label — suppress via `touch-action` / `contextmenu` handling already used on the
  Explore surface.
