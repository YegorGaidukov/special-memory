import { describe, it, expect } from "vitest";
import { multiplyQuat } from "@/lib/math/quat";

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
