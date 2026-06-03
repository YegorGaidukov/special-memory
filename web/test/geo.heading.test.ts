import { describe, it, expect } from "vitest";
import { headingToQuaternion } from "@/lib/geo/heading";

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
