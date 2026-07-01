// Zoom/scroll viewport math for the Navigate timeline. There are no handles: the
// visible window over the full year domain IS the active period. You scroll (one-finger
// drag = pan) and pinch (two fingers = zoom) the strip, and the visible [from,to] —
// snapped to whole years — becomes the broadcast filter. Pure + unit-tested; the
// pointer/pinch gesture layer is the seam in Timeline.tsx.
import type { TimeRange } from "./timeline";

export const MIN_SPAN = 1; // years — tightest zoom (a single year fills the strip)

/** Span of a viewport in years (never negative). */
export function span(v: TimeRange): number {
  return Math.max(v.to - v.from, 0);
}

/** Slide `view` by `deltaYears`, keeping its span, clamped to stay inside `domain`. */
export function panView(view: TimeRange, deltaYears: number, domain: TimeRange): TimeRange {
  const s = span(view);
  const maxFrom = Math.max(domain.to - s, domain.from);
  const from = Math.min(Math.max(view.from + deltaYears, domain.from), maxFrom);
  return { from, to: from + s };
}

/**
 * Zoom `view` by `factor` (>1 zooms in / shrinks the span) about `anchorFrac`
 * (0..1 across the current view — the point that stays put), clamped so the span
 * stays within [minSpan, domain span] and the window stays inside `domain`.
 */
export function zoomView(
  view: TimeRange,
  factor: number,
  anchorFrac: number,
  domain: TimeRange,
  minSpan = MIN_SPAN,
): TimeRange {
  const s = span(view);
  const domainSpan = Math.max(span(domain), minSpan);
  const anchorYear = view.from + anchorFrac * s;
  const newSpan = Math.min(Math.max(s / (factor || 1), minSpan), domainSpan);
  const maxFrom = Math.max(domain.to - newSpan, domain.from);
  const from = Math.min(Math.max(anchorYear - anchorFrac * newSpan, domain.from), maxFrom);
  return { from, to: from + newSpan };
}

/** Snap a float viewport to whole-year bounds for the shared filter. */
export function roundRange(v: TimeRange): TimeRange {
  return { from: Math.round(v.from), to: Math.round(v.to) };
}

/** Fraction 0..1 of a year within a viewport (midpoint when the span is zero). */
export function viewFraction(year: number, view: TimeRange): number {
  const s = span(view);
  if (s <= 0) return 0.5;
  return (year - view.from) / s;
}
