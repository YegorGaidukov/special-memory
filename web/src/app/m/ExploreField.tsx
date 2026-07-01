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

  // A component unmount mid-long-press must not fire the grab-candidate timer
  // against a torn-down component.
  useEffect(() => () => clearGrabCandidate(), []);

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
    if (grab.current) return; // an active grab owns the gesture; ignore extra fingers
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

    // Release an active grab → drop the memory here. While a grab is active, only
    // its own pointer may act; any other pointer lift just deregisters and returns
    // (it must not rearm pan/pinch underneath the grab).
    const g = grab.current;
    if (g) {
      if (g.pointerId === e.pointerId) {
        const w = unproject({ x: e.clientX, y: e.clientY }, viewRef.current);
        dropMemory(g.id, w.x, w.z);
        grab.current = null;
        setGrabbedId(null);
        setLivePos(null);
      }
      return; // a grab owns the gesture; a non-grab pointer lift must not rearm pan/pinch
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
