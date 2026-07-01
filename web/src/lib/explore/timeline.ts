// Pure timeline / year-filter logic shared by the phone (Navigate timeline +
// Explore field) and mirrored on the projector. A memory's year comes from its
// `captured_at`; undated memories can't sit on the timeline, so they're never
// hidden by it. The React timeline only owns the scrub gesture; the maths is here.

export interface TimeRange {
  from: number;
  to: number;
}

interface Dated {
  captured_at?: string;
}

/** Capture year (UTC) of a memory, or null when it has no valid `captured_at`. */
export function memoryYear(rec: Dated): number | null {
  if (!rec.captured_at) return null;
  const t = Date.parse(rec.captured_at);
  if (Number.isNaN(t)) return null;
  return new Date(t).getUTCFullYear();
}

/** Min/max capture year across the dated memories, or null if none are dated. */
export function yearBounds(records: readonly Dated[]): TimeRange | null {
  let from = Infinity;
  let to = -Infinity;
  for (const r of records) {
    const y = memoryYear(r);
    if (y === null) continue;
    if (y < from) from = y;
    if (y > to) to = y;
  }
  return to === -Infinity ? null : { from, to };
}

/** Inclusive year-in-range test. */
export function inRange(year: number, range: TimeRange): boolean {
  return year >= range.from && year <= range.to;
}

/**
 * Whether a memory is visible under an active filter. A null range means "no
 * filter" (all visible). Undated memories stay visible — the timeline can't
 * place them, so it shouldn't remove them.
 */
export function isVisibleInRange(rec: Dated, range: TimeRange | null): boolean {
  if (range === null) return true;
  const y = memoryYear(rec);
  return y === null || inRange(y, range);
}

/**
 * Fraction [0,1] of a year along the full timeline `bounds` — the x-position of
 * a dot/handle. A single-year city collapses to the midpoint.
 */
export function yearFraction(year: number, bounds: TimeRange): number {
  if (bounds.to === bounds.from) return 0.5;
  const f = (year - bounds.from) / (bounds.to - bounds.from);
  return Math.max(0, Math.min(1, f));
}

/** Whether a range spans the entire bounds (i.e. the filter is effectively off). */
export function isFullRange(range: TimeRange, bounds: TimeRange): boolean {
  return range.from <= bounds.from && range.to >= bounds.to;
}
