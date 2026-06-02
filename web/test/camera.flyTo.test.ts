import { describe, it, expect } from "vitest";
import { makeFlyTo } from "@/lib/camera/flyTo";

const from = { position: [0, 0, 0] as [number, number, number], lookAt: [0, 0, -1] as [number, number, number] };
const to = { position: [0, 0, 10] as [number, number, number], lookAt: [0, 0, 5] as [number, number, number] };

describe("makeFlyTo", () => {
  it("returns the start pose at elapsed 0 (not done)", () => {
    const s = makeFlyTo(from, to, 1000)(0);
    expect(s.position).toEqual([0, 0, 0]);
    expect(s.lookAt).toEqual([0, 0, -1]);
    expect(s.done).toBe(false);
  });

  it("returns the end pose at/after the duration (done)", () => {
    const s = makeFlyTo(from, to, 1000)(1000);
    expect(s.position).toEqual([0, 0, 10]);
    expect(s.lookAt).toEqual([0, 0, 5]);
    expect(s.done).toBe(true);
  });

  it("eases through the middle (cubic, so half-time = half-way)", () => {
    const s = makeFlyTo(from, to, 1000)(500);
    expect(s.position[2]).toBeCloseTo(5, 6);
    expect(s.lookAt[2]).toBeCloseTo(2, 6);
    expect(s.done).toBe(false);
  });

  it("clamps past the duration", () => {
    const s = makeFlyTo(from, to, 1000)(9999);
    expect(s.position).toEqual([0, 0, 10]);
    expect(s.done).toBe(true);
  });
});
