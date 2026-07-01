import { describe, it, expect } from "vitest";
import { toIso, stepMonth, monthGrid, weekdayLabels } from "@/lib/date/calendar";

describe("toIso", () => {
  it("zero-pads a 0-based month and day", () => {
    expect(toIso(2024, 0, 1)).toBe("2024-01-01");
    expect(toIso(2024, 11, 25)).toBe("2024-12-25");
  });
});

describe("stepMonth", () => {
  it("carries backwards across a year boundary", () => {
    expect(stepMonth(2024, 0, -1)).toEqual({ year: 2023, month: 11 });
  });
  it("carries forwards across a year boundary", () => {
    expect(stepMonth(2024, 11, 1)).toEqual({ year: 2025, month: 0 });
  });
  it("jumps multiple months", () => {
    expect(stepMonth(2024, 5, -8)).toEqual({ year: 2023, month: 9 });
  });
});

describe("monthGrid", () => {
  it("is always six weeks of seven days", () => {
    const g = monthGrid(2024, 0);
    expect(g).toHaveLength(6);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it("starts on the 1st with no spill when the month begins on the week start", () => {
    // Jan 2024 begins on a Monday (the week start), so no leading spill.
    const g = monthGrid(2024, 0);
    expect(g[0][0]).toEqual({ iso: "2024-01-01", day: 1, inMonth: true });
  });
  it("greys leading spill days from the previous month", () => {
    // Sep 2024 begins on a Sunday → Monday-first grid leads with Aug 26.
    const g = monthGrid(2024, 8);
    expect(g[0][0]).toEqual({ iso: "2024-08-26", day: 26, inMonth: false });
    expect(g[0][6]).toEqual({ iso: "2024-09-01", day: 1, inMonth: true });
  });
});

describe("weekdayLabels", () => {
  it("starts on Monday by default", () => {
    expect(weekdayLabels()).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });
  it("can start on Sunday", () => {
    expect(weekdayLabels(0)).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
  });
});
