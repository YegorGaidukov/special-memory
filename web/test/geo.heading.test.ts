import { describe, it, expect } from "vitest";
import { headingToQuaternion, quaternionToHeadingDeg } from "@/lib/geo/heading";

describe("headingToQuaternion", () => {
  it("maps heading 0 to the identity quaternion", () => {
    const q = headingToQuaternion(0);
    expect(q[0]).toBeCloseTo(0, 6);
    expect(q[1]).toBeCloseTo(0, 6);
    expect(q[2]).toBeCloseTo(0, 6);
    expect(q[3]).toBeCloseTo(1, 6);
  });

  it("matches the seed manifest for heading 45", () => {
    const [x, y, z, w] = headingToQuaternion(45);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0.38268343, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(w).toBeCloseTo(0.92387953, 6);
  });

  it("matches the seed manifest for heading 90", () => {
    const [, y, , w] = headingToQuaternion(90);
    expect(y).toBeCloseTo(0.70710678, 6);
    expect(w).toBeCloseTo(0.70710678, 6);
  });

  it("returns a unit quaternion", () => {
    const [x, y, z, w] = headingToQuaternion(123);
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 6);
  });

  it("only rotates about Y (x and z stay 0)", () => {
    const [x, , z] = headingToQuaternion(-45);
    expect(x).toBe(0);
    expect(z).toBe(0);
  });
});

describe("quaternionToHeadingDeg", () => {
  it("maps the identity quaternion to heading 0", () => {
    expect(quaternionToHeadingDeg([0, 0, 0, 1])).toBeCloseTo(0, 6);
  });

  it("round-trips headingToQuaternion for headings across the circle", () => {
    for (const deg of [0, 45, 90, 123, 180, 270, 359]) {
      expect(quaternionToHeadingDeg(headingToQuaternion(deg))).toBeCloseTo(deg, 4);
    }
  });

  it("normalizes the result into [0, 360)", () => {
    const h = quaternionToHeadingDeg(headingToQuaternion(-45));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(h).toBeCloseTo(315, 4);
  });

  it("extracts the yaw component, ignoring pitch/roll", () => {
    // A pure 90°-about-Y quaternion still reads as heading 90 even though the
    // gizmo may add small tilt; here the input is exactly yaw-only.
    expect(quaternionToHeadingDeg([0, 0.70710678, 0, 0.70710678])).toBeCloseTo(90, 4);
  });
});
