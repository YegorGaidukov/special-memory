import { describe, it, expect } from "vitest";
import {
  memoryYear,
  yearBounds,
  inRange,
  isVisibleInRange,
  yearFraction,
  isFullRange,
} from "@/lib/explore/timeline";

const at = (captured_at?: string) => ({ captured_at });

describe("memoryYear", () => {
  it("extracts the UTC year", () => {
    expect(memoryYear(at("2019-06-15T14:30:00.000Z"))).toBe(2019);
  });
  it("is null when undated", () => {
    expect(memoryYear(at())).toBeNull();
    expect(memoryYear(at("not-a-date"))).toBeNull();
  });
});

describe("yearBounds", () => {
  it("spans min..max across dated memories", () => {
    expect(
      yearBounds([at("2012-01-01T00:00:00Z"), at("2026-01-01T00:00:00Z"), at("2019-01-01T00:00:00Z")]),
    ).toEqual({ from: 2012, to: 2026 });
  });
  it("ignores undated memories", () => {
    expect(yearBounds([at(), at("2020-01-01T00:00:00Z"), at()])).toEqual({ from: 2020, to: 2020 });
  });
  it("is null when nothing is dated", () => {
    expect(yearBounds([at(), at()])).toBeNull();
  });
});

describe("inRange", () => {
  it("is inclusive at both ends", () => {
    const r = { from: 2012, to: 2026 };
    expect(inRange(2012, r)).toBe(true);
    expect(inRange(2026, r)).toBe(true);
    expect(inRange(2011, r)).toBe(false);
    expect(inRange(2027, r)).toBe(false);
  });
});

describe("isVisibleInRange", () => {
  it("no range → everything visible", () => {
    expect(isVisibleInRange(at(), null)).toBe(true);
    expect(isVisibleInRange(at("2000-01-01T00:00:00Z"), null)).toBe(true);
  });
  it("keeps undated memories even under a filter", () => {
    expect(isVisibleInRange(at(), { from: 2020, to: 2021 })).toBe(true);
  });
  it("hides dated memories outside the range", () => {
    expect(isVisibleInRange(at("2010-01-01T00:00:00Z"), { from: 2020, to: 2021 })).toBe(false);
    expect(isVisibleInRange(at("2020-06-01T00:00:00Z"), { from: 2020, to: 2021 })).toBe(true);
  });
});

describe("yearFraction", () => {
  it("maps endpoints to 0 and 1", () => {
    const b = { from: 2012, to: 2026 };
    expect(yearFraction(2012, b)).toBe(0);
    expect(yearFraction(2026, b)).toBe(1);
    expect(yearFraction(2019, b)).toBeCloseTo(0.5, 6);
  });
  it("collapses a single-year city to the midpoint", () => {
    expect(yearFraction(2020, { from: 2020, to: 2020 })).toBe(0.5);
  });
  it("clamps out-of-range years", () => {
    expect(yearFraction(2000, { from: 2012, to: 2026 })).toBe(0);
    expect(yearFraction(2100, { from: 2012, to: 2026 })).toBe(1);
  });
});

describe("isFullRange", () => {
  it("true when the range covers the bounds", () => {
    expect(isFullRange({ from: 2012, to: 2026 }, { from: 2012, to: 2026 })).toBe(true);
  });
  it("false when narrowed", () => {
    expect(isFullRange({ from: 2015, to: 2020 }, { from: 2012, to: 2026 })).toBe(false);
  });
});
