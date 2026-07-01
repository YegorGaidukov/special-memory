import { describe, it, expect } from "vitest";
import { panView, zoomView, roundRange, viewFraction, span } from "@/lib/explore/timelineView";

const domain = { from: 2000, to: 2020 };

describe("panView", () => {
  it("slides the window while preserving its span", () => {
    expect(panView({ from: 2005, to: 2010 }, 3, domain)).toEqual({ from: 2008, to: 2013 });
    expect(panView({ from: 2005, to: 2010 }, -3, domain)).toEqual({ from: 2002, to: 2007 });
  });
  it("clamps to the domain start and end", () => {
    expect(panView({ from: 2002, to: 2007 }, -10, domain)).toEqual({ from: 2000, to: 2005 });
    expect(panView({ from: 2014, to: 2019 }, 10, domain)).toEqual({ from: 2015, to: 2020 });
  });
  it("cannot pan a fully-zoomed-out window", () => {
    expect(panView({ from: 2000, to: 2020 }, 5, domain)).toEqual({ from: 2000, to: 2020 });
  });
});

describe("zoomView", () => {
  it("shrinks the span when zooming in, holding the anchor fraction fixed", () => {
    // zoom 2x about the centre of a 2000..2020 view → 2005..2015
    expect(zoomView({ from: 2000, to: 2020 }, 2, 0.5, domain)).toEqual({ from: 2005, to: 2015 });
  });
  it("holds the left edge when anchored at 0", () => {
    expect(zoomView({ from: 2000, to: 2020 }, 2, 0, domain)).toEqual({ from: 2000, to: 2010 });
  });
  it("clamps zoom-out to the full domain span", () => {
    expect(zoomView({ from: 2005, to: 2015 }, 0.25, 0.5, domain)).toEqual({ from: 2000, to: 2020 });
  });
  it("clamps zoom-in to the minimum span", () => {
    const v = zoomView({ from: 2000, to: 2020 }, 1000, 0.5, domain, 1);
    expect(span(v)).toBe(1);
  });
});

describe("roundRange", () => {
  it("snaps float viewport edges to whole years", () => {
    expect(roundRange({ from: 2004.4, to: 2011.6 })).toEqual({ from: 2004, to: 2012 });
  });
});

describe("viewFraction", () => {
  it("maps edges to 0 and 1", () => {
    const v = { from: 2000, to: 2020 };
    expect(viewFraction(2000, v)).toBe(0);
    expect(viewFraction(2020, v)).toBe(1);
    expect(viewFraction(2010, v)).toBeCloseTo(0.5, 6);
  });
  it("returns the midpoint for a zero-span view", () => {
    expect(viewFraction(2020, { from: 2020, to: 2020 })).toBe(0.5);
  });
});
