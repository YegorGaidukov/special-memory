import { describe, it, expect } from "vitest";
import { pickMemory } from "@/lib/camera/pick";
import type { MemoryRecord } from "@/lib/manifest/types";

function rec(id: string, position: [number, number, number]): MemoryRecord {
  return {
    id,
    status: "approved",
    thumbnail_url: "a.jpg",
    splat_url: "a.ply",
    transform: { position, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

const opts = { maxAngleRad: 0.5, maxDist: 1000 };

describe("pickMemory", () => {
  it("picks the memory the camera is looking straight at", () => {
    const a = rec("a", [0, 0, -10]);
    const b = rec("b", [20, 0, -10]); // ~63° off-axis, outside the cone
    const hit = pickMemory([a, b], [0, 0, 0], [0, 0, -1], opts);
    expect(hit?.id).toBe("a");
  });

  it("returns null when nothing is within the view cone", () => {
    const behind = rec("behind", [0, 0, 10]);
    expect(pickMemory([behind], [0, 0, 0], [0, 0, -1], opts)).toBeNull();
  });

  it("prefers the more centered memory when several are in the cone", () => {
    const centered = rec("centered", [0, 0, -10]);
    const offset = rec("offset", [2, 0, -10]); // ~11° off-axis, still in cone
    const hit = pickMemory([offset, centered], [0, 0, 0], [0, 0, -1], opts);
    expect(hit?.id).toBe("centered");
  });

  it("ignores memories beyond maxDist", () => {
    const far = rec("far", [0, 0, -5000]);
    expect(pickMemory([far], [0, 0, 0], [0, 0, -1], opts)).toBeNull();
  });
});
