"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useControlSocket } from "@/hooks/useControlSocket";
import { clampZoom, fitView, project, worldBounds, zoomAboutPoint } from "@/lib/explore/minimap";
import { isVisibleInRange, memoryYear, type TimeRange } from "@/lib/explore/timeline";
import type { MemoryRecord } from "@/lib/manifest/types";
import styles from "./mobile.module.css";

// 5b Explore: the shadow field IS the city. Each memory floats as a serif name label
// at its real place — a north-up top-down minimap of the memories' world positions
// (transform x/z). Drag to pan through the field; pinch (or wheel) to zoom toward the
// fingers; tap a label to fly the projector there (the existing jump-by-id control
// message). The shared timeline range dims memories outside the active window.
const DRAG_THRESHOLD = 6; // px of travel before a press counts as a pan, not a tap
const ZOOM_MIN = 0.6; // multiplier on the fit-to-content base scale
const ZOOM_MAX = 12;
const WHEEL_SENS = 0.0015; // px of deltaY → zoom-factor exponent

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

  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const points = useMemo(
    () => records.map((r) => ({ x: r.transform.position[0], z: r.transform.position[2] })),
    [records],
  );
  const view = useMemo(() => {
    const base = fitView(worldBounds(points), size.w, size.h);
    return { ...base, scale: base.scale * zoom, panX: pan.x, panY: pan.y };
  }, [points, size.w, size.h, pan.x, pan.y, zoom]);

  const twoFingers = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
    const pts = [...pointers.current.values()];
    return pts.length >= 2 ? [pts[0], pts[1]] : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const two = twoFingers();
    if (two) {
      // Second finger down → start a pinch; cancel any single-finger pan.
      drag.current = null;
      pinch.current = { dist: Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y), zoom: zoomRef.current };
    } else {
      drag.current = { startX: e.clientX, startY: e.clientY, baseX: panRef.current.x, baseY: panRef.current.y, moved: false };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const pt = pointers.current.get(e.pointerId);
    if (pt) {
      pt.x = e.clientX;
      pt.y = e.clientY;
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
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
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
    // A pan gesture shouldn't also fire the tapped label.
    if (drag.current?.moved) return;
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
        const p = project(rec.transform.position[0], rec.transform.position[2], view);
        const visible = isVisibleInRange(rec, range);
        return (
          <button
            key={rec.id}
            type="button"
            className={`${styles.memoryLabel} ${visible ? "" : styles.memoryLabelDim}`}
            style={{ left: p.x, top: p.y }}
            onClick={() => travelTo(rec)}
          >
            {labelFor(rec)}
          </button>
        );
      })}
    </div>
  );
}
