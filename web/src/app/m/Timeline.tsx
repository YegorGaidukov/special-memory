"use client";

import { useMemo, useRef, useState } from "react";
import { memoryYear, yearBounds, type TimeRange } from "@/lib/explore/timeline";
import { panView, roundRange, span, viewFraction, zoomView } from "@/lib/explore/timelineView";
import type { MemoryRecord } from "@/lib/manifest/types";
import styles from "./mobile.module.css";

// The Navigate timeline: memories are dots along a thin line by capture year. There are
// no handles — the strip itself is the period. Drag (one finger) scrolls through time;
// pinch (two fingers) zooms in/out. The visible window IS the active filter: its edges
// are the year labels, and — snapped to whole years — it's broadcast to the projector.
// With no dated memories it still shows, spanning 1900 → now. Gesture math is pure and
// unit-tested (lib/explore/timelineView); this component only wires the pointers.
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

  // Full scrollable extent — the dated memories, or 1900 → now when nothing is dated.
  const domain = useMemo<TimeRange>(
    () => yearBounds(records) ?? { from: 1900, to: new Date().getUTCFullYear() },
    [records],
  );

  const dots = useMemo(
    () => records.map((r) => memoryYear(r)).filter((y): y is number => y !== null),
    [records],
  );

  // Visible window (float, for smooth gestures). Seed from any restored period, else the
  // full domain; reset when the domain itself changes (e.g. memories load / a year is added).
  const [view, setView] = useState<TimeRange>(() => range ?? domain);
  const viewRef = useRef(view);
  const applyView = (v: TimeRange) => {
    viewRef.current = v;
    setView(v);
  };
  // Reset the window when the domain itself changes (memories load / a year is added).
  // Adjusting state during render is the React-blessed way to derive from changed props.
  const prevDomain = useRef(domain);
  if (prevDomain.current.from !== domain.from || prevDomain.current.to !== domain.to) {
    prevDomain.current = domain;
    viewRef.current = domain;
    setView(domain);
  }

  // Broadcast the snapped window only when its whole-year value actually changes.
  const lastSent = useRef<TimeRange>(roundRange(view));
  const commit = (v: TimeRange) => {
    const r = roundRange(v);
    if (r.from !== lastSent.current.from || r.to !== lastSent.current.to) {
      lastSent.current = r;
      onChange(r);
    }
  };

  // Pointer bookkeeping for pan (1 finger) + pinch (2 fingers). `base` snapshots the view
  // and finger positions whenever the finger set changes, so each move is a stable delta.
  const pointers = useRef(new Map<number, number>()); // id -> clientX
  const base = useRef<{ view: TimeRange; xs: number[] } | null>(null);

  const geom = () => {
    const el = trackRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const usable = Math.max(r.width - TRACK_INSET * 2, 1);
    const left0 = r.left + TRACK_INSET;
    return { usable, fracOf: (x: number) => Math.min(1, Math.max(0, (x - left0) / usable)) };
  };
  const rebase = () => {
    base.current = { view: viewRef.current, xs: [...pointers.current.values()] };
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    rebase();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.clientX);
    const b = base.current;
    const g = geom();
    if (!b || !g) return;
    const xs = [...pointers.current.values()];

    let next: TimeRange;
    if (xs.length >= 2 && b.xs.length >= 2) {
      // Pinch: zoom about the (base) midpoint, then pan by however far it moved.
      const baseDist = Math.abs(b.xs[0] - b.xs[1]) || 1;
      const baseMid = (b.xs[0] + b.xs[1]) / 2;
      const curMid = (xs[0] + xs[1]) / 2;
      const factor = Math.abs(xs[0] - xs[1]) / baseDist;
      const zoomed = zoomView(b.view, factor, g.fracOf(baseMid), domain);
      const panYears = -((curMid - baseMid) / g.usable) * span(zoomed);
      next = panView(zoomed, panYears, domain);
    } else {
      // Pan: drag right → move earlier in time (content follows the finger).
      const panYears = -((xs[0] - b.xs[0]) / g.usable) * span(b.view);
      next = panView(b.view, panYears, domain);
    }
    applyView(next);
    commit(next);
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) rebase();
    else base.current = null;
  };

  const shown = roundRange(view);
  return (
    <div
      ref={trackRef}
      className={styles.timeline}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className={`${styles.timelineYear} ${styles.timelineYearFrom}`}>{shown.from}</span>
      <span className={`${styles.timelineYear} ${styles.timelineYearTo}`}>{shown.to}</span>
      <div className={styles.timelineLine} />
      {dots.map((year, i) => {
        const frac = viewFraction(year, view);
        if (frac < 0 || frac > 1) return null; // outside the visible period
        return (
          <span key={i} className={styles.timelineDot} style={{ left: trackLeft(frac) }} />
        );
      })}
    </div>
  );
}
