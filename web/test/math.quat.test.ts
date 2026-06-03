import { describe, it, expect } from "vitest";
import { multiplyQuat, conjugateQuat } from "@/lib/math/quat";
import type { Quat } from "@/lib/manifest/types";

describe("multiplyQuat", () => {
  it("identity times identity is identity", () => {
    expect(multiplyQuat([0, 0, 0, 1], [0, 0, 0, 1])).toEqual([0, 0, 0, 1]);
  });

  it("any quaternion times identity is unchanged", () => {
    expect(multiplyQuat([1, 0, 0, 0], [0, 0, 0, 1])).toEqual([1, 0, 0, 0]);
  });

  it("matches the Hamilton product (180° about Y ∘ 180° about X = 180° about Z)", () => {
    // q = a * b means: apply b first, then a, to a vector.
    expect(multiplyQuat([0, 1, 0, 0], [1, 0, 0, 0])).toEqual([0, 0, -1, 0]);
  });
});

describe("conjugateQuat", () => {
  it("negates the vector part and keeps w", () => {
    expect(conjugateQuat([0.1, 0.2, 0.3, 0.9])).toEqual([-0.1, -0.2, -0.3, 0.9]);
  });

  it("is the inverse rotation: q · conj(q) = identity for a unit quaternion", () => {
    const q: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; // 90° about Y (unit norm)
    const r = multiplyQuat(q, conjugateQuat(q));
    expect(r[0]).toBeCloseTo(0, 6);
    expect(r[1]).toBeCloseTo(0, 6);
    expect(r[2]).toBeCloseTo(0, 6);
    expect(r[3]).toBeCloseTo(1, 6);
  });
});
