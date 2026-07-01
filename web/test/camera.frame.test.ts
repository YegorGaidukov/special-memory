import { describe, it, expect } from "vitest";
import { framePoseForRecord } from "@/lib/camera/frame";
import type { MemoryRecord, Quat, Vec3 } from "@/lib/manifest/types";

function rec(position: Vec3, quaternion: Quat = [0, 0, 0, 1]): MemoryRecord {
  return {
    id: "m",
    status: "approved",
    thumbnail_url: "a.jpg",
    splat_url: "a.ply",
    transform: { position, quaternion, scale: [1, 1, 1] },
  };
}

const SIN45 = Math.SQRT1_2; // sin(45°) = cos(45°)

describe("framePoseForRecord", () => {
  it("stands `standoff` behind the origin on the photographer's side for heading 0", () => {
    // heading 0 → forward (0,0,-1); camera sits at position - forward*standoff = +Z.
    const pose = framePoseForRecord(rec([0, 0, 0]), 10);
    expect(pose.position[0]).toBeCloseTo(0, 6);
    expect(pose.position[1]).toBeCloseTo(0, 6);
    expect(pose.position[2]).toBeCloseTo(10, 6);
    expect(pose.lookAt).toEqual([0, 0, 0]);
  });

  it("uses the memory heading for the approach direction (heading 90 → +X)", () => {
    // heading 90 → forward ≈ (-1,0,0); camera offset toward +X of the origin.
    const pose = framePoseForRecord(rec([0, 0, 0], [0, SIN45, 0, SIN45]), 10);
    expect(pose.position[0]).toBeCloseTo(10, 5);
    expect(pose.position[1]).toBeCloseTo(0, 6);
    expect(pose.position[2]).toBeCloseTo(0, 5);
    expect(pose.lookAt).toEqual([0, 0, 0]);
  });

  it("offsets relative to the memory's own position", () => {
    const pose = framePoseForRecord(rec([5, 2, -40]), 8);
    expect(pose.position[0]).toBeCloseTo(5, 6);
    expect(pose.position[1]).toBeCloseTo(2, 6);
    expect(pose.position[2]).toBeCloseTo(-32, 6); // -40 - (-1)*8
    expect(pose.lookAt).toEqual([5, 2, -40]);
  });
});
