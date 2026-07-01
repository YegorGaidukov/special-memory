import { describe, it, expect } from "vitest";
import { joystickVector, applyExpo } from "@/lib/control/input";

describe("joystickVector", () => {
  it("is zero at the origin", () => {
    expect(joystickVector(0, 0, 100)).toEqual({ x: 0, y: 0 });
  });

  it("maps a full-right offset to x=1", () => {
    expect(joystickVector(100, 0, 100)).toEqual({ x: 1, y: 0 });
  });

  it("keeps screen-down as +y (caller flips for forward)", () => {
    expect(joystickVector(0, 100, 100)).toEqual({ x: 0, y: 1 });
  });

  it("applies a dead-zone near the centre", () => {
    expect(joystickVector(5, 5, 100, 0.12)).toEqual({ x: 0, y: 0 });
  });

  it("clamps magnitude to 1 beyond the radius", () => {
    const v = joystickVector(300, 0, 100);
    expect(v.x).toBeCloseTo(1, 6);
    expect(v.y).toBeCloseTo(0, 6);
  });

  it("preserves direction of a diagonal beyond the radius (unit magnitude)", () => {
    const v = joystickVector(200, 200, 100);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    expect(v.x).toBeCloseTo(v.y, 6);
  });

  it("returns analog magnitude inside the radius", () => {
    const v = joystickVector(50, 0, 100);
    expect(v.x).toBeCloseTo(0.5, 6);
  });

  it("guards a zero radius", () => {
    expect(joystickVector(10, 10, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("applyExpo", () => {
  it("leaves the ±1 endpoints unchanged", () => {
    expect(applyExpo(1, 0.65)).toBeCloseTo(1, 6);
    expect(applyExpo(-1, 0.65)).toBeCloseTo(-1, 6);
  });

  it("leaves the centre at zero", () => {
    expect(applyExpo(0, 0.65)).toBe(0);
  });

  it("is the identity when e = 0 (linear)", () => {
    expect(applyExpo(0.37, 0)).toBeCloseTo(0.37, 6);
    expect(applyExpo(-0.8, 0)).toBeCloseTo(-0.8, 6);
  });

  it("is gentler near the centre for e > 0", () => {
    expect(applyExpo(0.5, 0.65)).toBeLessThan(0.5);
    expect(Math.abs(applyExpo(0.5, 0.65))).toBeGreaterThan(0);
  });

  it("preserves sign", () => {
    expect(applyExpo(-0.5, 0.65)).toBeLessThan(0);
    expect(applyExpo(0.5, 0.65)).toBeGreaterThan(0);
  });
});
