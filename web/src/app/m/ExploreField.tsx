"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useControlSocket } from "@/hooks/useControlSocket";
import { fitView, project, worldBounds } from "@/lib/explore/minimap";
import { isVisibleInRange, memoryYear, type TimeRange } from "@/lib/explore/timeline";
import type { MemoryRecord } from "@/lib/manifest/types";
import styles from "./mobile.module.css";

// 5b Explore: the shadow field IS the city. Each memory floats as a serif name label
// at its real place — a north-up top-down minimap of the memories' world positions
// (transform x/z). Drag to pan through the field; tap a label to fly the projector
// there (the existing jump-by-id control message). The shared timeline range dims
// memories outside the active window.
const DRAG_THRESHOLD = 6; // px of travel before a press counts as a pan, not a tap

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
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(
    null,
  );

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
    return { ...base, panX: pan.x, panY: pan.y };
  }, [points, size.w, size.h, pan.x, pan.y]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
    if (d.moved) setPan({ x: d.baseX + dx, y: d.baseY + dy });
  };
  const onPointerUp = () => {
    drag.current = null;
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
