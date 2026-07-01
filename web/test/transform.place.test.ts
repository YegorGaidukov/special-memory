import { describe, it, expect } from "vitest";
import { groundMove } from "@/lib/transform/place";
import type { Transform } from "@/lib/manifest/types";

const base: Transform = {
  position: [10, 4, -6],
  quaternion: [0, 0.7071, 0, 0.7071],
  scale: [2, 2, 2],
};

describe("groundMove", () => {
  it("replaces only x and z, preserving height", () => {
    const t = groundMove(base, 25, -13);
    expect(t.position).toEqual([25, 4, -13]);
  });

  it("preserves the quaternion", () => {
    expect(groundMove(base, 0, 0).quaternion).toEqual([0, 0.7071, 0, 0.7071]);
  });

  it("collapses a Vec3 scale to its first component (scalar)", () => {
    expect(groundMove(base, 0, 0).scale).toBe(2);
  });

  it("passes a scalar scale through unchanged", () => {
    const t: Transform = { ...base, scale: 3 };
    expect(groundMove(t, 0, 0).scale).toBe(3);
  });
});
