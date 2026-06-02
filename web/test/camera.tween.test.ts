import { describe, it, expect } from "vitest";
import { easeInOutCubic, lerp, lerpVec3 } from "@/lib/camera/tween";

describe("easeInOutCubic", () => {
  it("pins the endpoints and midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });

  it("is monotonically increasing", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("lerp / lerpVec3", () => {
  it("lerp interpolates a scalar", () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it("lerpVec3 interpolates each component", () => {
    expect(lerpVec3([0, 0, 0], [10, 20, -40], 0.5)).toEqual([5, 10, -20]);
  });
});
