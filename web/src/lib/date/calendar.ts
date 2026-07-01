// Pure calendar-grid maths for the Add screen's date picker. A month renders as a fixed
// 6×7 grid of ISO day cells (leading/trailing spill days from the neighbouring months are
// flagged so the UI can grey them), so the popover never changes height. Week starts
// Monday (de-DE / Wolfsburg). "Today" is deliberately absent — it's impure; the component
// overlays selected/future state onto these cells. All unit-tested; no Date.now here.

export interface DayCell {
  iso: string; // YYYY-MM-DD
  day: number; // day-of-month
  inMonth: boolean; // false for spill days from the previous/next month
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO date string for a 0-based month index. */
export function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Shift a [year, 0-based month] by `delta` months, carrying the year. */
export function stepMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Six weeks of day cells covering `month` (0-based), including neighbouring spill days. */
export function monthGrid(year: number, month: number, weekStartsOn = 1): DayCell[][] {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun … 6=Sat
  const lead = (firstDow - weekStartsOn + 7) % 7;
  const cursor = new Date(Date.UTC(year, month, 1 - lead));
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        iso: toIso(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()),
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Weekday header labels aligned to `weekStartsOn` (Monday by default). */
export function weekdayLabels(weekStartsOn = 1): string[] {
  const base = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return Array.from({ length: 7 }, (_, i) => base[(weekStartsOn + i) % 7]);
}
