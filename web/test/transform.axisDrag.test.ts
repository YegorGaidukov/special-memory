import { describe, it, expect } from "vitest";
import { axisDragPlaneNormal, axisDragParam, type V3 } from "@/lib/transform/axisDrag";

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];
const ORIGIN: V3 = [0, 0, 0];

describe("axisDragPlaneNormal", () => {
  it("removes the axis-parallel component of the view direction", () => {
    // Looking down -Z while dragging X: the plane should contain X and face the
    // camera, so its normal is the (normalized) Z part of the view.
    const n = axisDragPlaneNormal(X, [0, 0, -1])!;
    expect(n[0]).toBeCloseTo(0);
    expect(Math.abs(n[2])).toBeCloseTo(1);
  });

  it("returns a unit-length normal", () => {
    const n = axisDragPlaneNormal(X, [0.3, 0.4, -0.866])!;
    expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1);
  });

  it("returns null when the axis points along the view direction", () => {
    expect(axisDragPlaneNormal(Z, [0, 0, -1])).toBeNull();
  });
});

describe("axisDragParam", () => {
  // A camera at (0,0,10) looking toward -Z, dragging the X axis through origin.
  const camera: V3 = [0, 0, 10];
  const planeN = axisDragPlaneNormal(X, [0, 0, -1])!;
  const rayFrom = (target: V3) => {
    const dir: V3 = [target[0] - camera[0], target[1] - camera[1], target[2] - camera[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    return { o: camera, d: [dir[0] / len, dir[1] / len, dir[2] / len] as V3 };
  };

  it("is a no-op when the grab ray and move ray are identical (the bug)", () => {
    const r = rayFrom([3, 0, 0]);
    const s0 = axisDragParam(r.o, r.d, ORIGIN, X, planeN)!;
    const s = axisDragParam(r.o, r.d, ORIGIN, X, planeN)!;
    expect(s - s0).toBeCloseTo(0); // grab with no pointer motion => zero movement
  });

  it("reads the world X of where the ray crosses the splat's plane", () => {
    // A ray aimed at x=4 on the z=0 plane should yield s ~= 4 along X.
    const r = rayFrom([4, 0, 0]);
    expect(axisDragParam(r.o, r.d, ORIGIN, X, planeN)!).toBeCloseTo(4);
  });

  it("moves monotonically as the pointer slides along the axis", () => {
    const a = axisDragParam(...args(rayFrom([1, 0, 0]), X, planeN));
    const b = axisDragParam(...args(rayFrom([5, 0, 0]), X, planeN));
    expect(b!).toBeGreaterThan(a!);
  });

  it("ignores pointer motion perpendicular to the axis", () => {
    // Sliding the pointer in Y (off-axis) must not change the X param.
    const flat = axisDragParam(...args(rayFrom([3, 0, 0]), X, planeN))!;
    const lifted = axisDragParam(...args(rayFrom([3, 2, 0]), X, planeN))!;
    expect(lifted).toBeCloseTo(flat);
  });

  it("returns null when the ray is parallel to the drag plane", () => {
    // Ray travelling within a plane whose normal it never crosses.
    expect(axisDragParam([0, 0, 10], [1, 0, 0], ORIGIN, X, planeN)).toBeNull();
  });
});

// Spread helper so the calls above read as (ray, axis, plane).
function args(
  r: { o: V3; d: V3 },
  axis: V3,
  planeN: V3,
): [V3, V3, V3, V3, V3] {
  return [r.o, r.d, [0, 0, 0], axis, planeN];
}
