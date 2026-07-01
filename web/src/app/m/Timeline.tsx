"use client";

import { useMemo, useRef } from "react";
import { memoryYear, yearBounds, yearFraction, type TimeRange } from "@/lib/explore/timeline";
import type { MemoryRecord } from "@/lib/manifest/types";
import styles from "./mobile.module.css";

// The Navigate timeline: memories are dots along a thin line by capture year; two
// glass handles bracket the active window. Narrowing the window = zooming into a period,
// which filters which memories are live (dimmed dots + broadcast to the projector).
// Handles snap to whole years, so the filter only changes at year boundaries.
const TRACK_INSET = 24; // px, matches .timelineLine's left/right inset

/** Left CSS position of a fraction along the inset track. */
function trackLeft(frac: number): string {
  return `calc(${TRACK_INSET}px + ${frac} * (100% - ${TRACK_INSET * 2}px))`;
}

export default function Timeline({
  records,
  range,
  onChange,
}: {
  records: MemoryRecord[];
  range: TimeRange | null;
  onChange: (r: TimeRange) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const active = useRef<null | "from" | "to">(null);
  const bounds = useMemo(() => yearBounds(records), [records]);

  const dots = useMemo(
    () =>
      records
        .map((r) => memoryYear(r))
        .filter((y): y is number => y !== null),
    [records],
  );

  if (!bounds) return null; // nothing dated → nothing to scrub
  const win = range ?? bounds;

  const yearAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return win.from;
    const r = el.getBoundingClientRect();
    const usable = Math.max(r.width - TRACK_INSET * 2, 1);
    const frac = Math.min(1, Math.max(0, (clientX - (r.left + TRACK_INSET)) / usable));
    return Math.round(bounds.from + frac * (bounds.to - bounds.from));
  };

  const applyYear = (year: number) => {
    if (active.current === "from") onChange({ from: Math.min(year, win.to), to: win.to });
    else if (active.current === "to") onChange({ from: win.from, to: Math.max(year, win.from) });
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const year = yearAt(e.clientX);
    // Grab whichever handle is nearer to where you pressed.
    active.current =
      Math.abs(year - win.from) <= Math.abs(year - win.to) ? "from" : "to";
    applyYear(year);
  };
  const onMove = (e: React.PointerEvent) => {
    if (active.current) applyYear(yearAt(e.clientX));
  };
  const onUp = () => {
    active.current = null;
  };

  return (
    <div
      ref={trackRef}
      className={styles.timeline}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className={`${styles.timelineYear} ${styles.timelineYearFrom}`}>{bounds.from}</span>
      <span className={`${styles.timelineYear} ${styles.timelineYearTo}`}>{bounds.to}</span>
      <div className={styles.timelineLine} />
      {dots.map((year, i) => (
        <span
          key={i}
          className={`${styles.timelineDot} ${
            year >= win.from && year <= win.to ? "" : styles.timelineDotDim
          }`}
          style={{ left: trackLeft(yearFraction(year, bounds)) }}
        />
      ))}
      <span className={styles.timelineHandle} style={{ left: trackLeft(yearFraction(win.from, bounds)) }} />
      <span className={styles.timelineHandle} style={{ left: trackLeft(yearFraction(win.to, bounds)) }} />
    </div>
  );
}
