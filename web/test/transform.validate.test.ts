import { describe, it, expect } from "vitest";
import { isValidTransform } from "@/lib/transform/validate";

const valid = {
  position: [1, 2, 3],
  quaternion: [0, 0, 0, 1],
  scale: 1.5,
};

describe("isValidTransform", () => {
  it("accepts a well-formed transform", () => {
    expect(isValidTransform(valid)).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isValidTransform(null)).toBe(false);
    expect(isValidTransform("nope")).toBe(false);
    expect(isValidTransform(undefined)).toBe(false);
  });

  it("rejects a position that is not a length-3 finite array", () => {
    expect(isValidTransform({ ...valid, position: [1, 2] })).toBe(false);
    expect(isValidTransform({ ...valid, position: [1, 2, NaN] })).toBe(false);
    expect(isValidTransform({ ...valid, position: [1, 2, Infinity] })).toBe(false);
    expect(isValidTransform({ ...valid, position: "1,2,3" })).toBe(false);
  });

  it("rejects a quaternion that is not a length-4 finite array", () => {
    expect(isValidTransform({ ...valid, quaternion: [0, 0, 1] })).toBe(false);
    expect(isValidTransform({ ...valid, quaternion: [0, 0, 0, NaN] })).toBe(false);
  });

  it("rejects a non-positive or non-finite scale", () => {
    expect(isValidTransform({ ...valid, scale: 0 })).toBe(false);
    expect(isValidTransform({ ...valid, scale: -2 })).toBe(false);
    expect(isValidTransform({ ...valid, scale: NaN })).toBe(false);
    expect(isValidTransform({ ...valid, scale: [1, 1, 1] })).toBe(false);
  });
});
