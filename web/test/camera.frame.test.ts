import { describe, it, expect } from "vitest";
import { framePoseForRecord } from "@/lib/camera/frame";
import type { MemoryRecord } from "@/lib/manifest/types";

function rec(position: [number, number, number]): MemoryRecord {
  return {
    id: "m",
    status: "approved",
    thumbnail_url: "a.jpg",
    splat_url: "a.ply",
    transform: { position, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

describe("framePoseForRecord", () => {
  it("stops `standoff` units from the memory, along the approach direction, looking at it", () => {
    const pose = framePoseForRecord(rec([10, 0, -40]), [10, 0, 0], 8);
    // approach from +Z of the target -> camera sits 8 units toward the viewer
    expect(pose.position).toEqual([10, 0, -32]);
    expect(pose.lookAt).toEqual([10, 0, -40]);
  });

  it("falls back to a default direction when already at the memory", () => {
    const pose = framePoseForRecord(rec([0, 0, 0]), [0, 0, 0], 5);
    expect(pose.position).toEqual([0, 0, 5]);
    expect(pose.lookAt).toEqual([0, 0, 0]);
  });
});
