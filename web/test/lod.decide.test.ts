import { describe, it, expect } from "vitest";
import { decideLod } from "@/lib/lod/decide";
import type { MemoryRecord } from "@/lib/manifest/types";

function rec(id: string, z: number): MemoryRecord {
  return {
    id,
    status: "approved",
    thumbnail_url: "a.jpg",
    splat_url: "a.ply",
    transform: { position: [0, 0, z], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

const cfg = { loadRadius: 40, disposeRadius: 60, maxConcurrentLoads: 1 };
const origin: [number, number, number] = [0, 0, 0];

describe("decideLod", () => {
  it("loads an unloaded memory within the load radius", () => {
    const d = decideLod([rec("near", -10)], origin, new Set(), cfg);
    expect(d.toLoad).toEqual(["near"]);
    expect(d.toUnload).toEqual([]);
  });

  it("does not load a memory beyond the load radius", () => {
    const d = decideLod([rec("mid", -50)], origin, new Set(), cfg);
    expect(d.toLoad).toEqual([]);
  });

  it("unloads a loaded memory past the dispose radius", () => {
    const d = decideLod([rec("far", -100)], origin, new Set(["far"]), cfg);
    expect(d.toUnload).toEqual(["far"]);
  });

  it("keeps a loaded memory in the hysteresis band (load < d < dispose)", () => {
    const d = decideLod([rec("mid", -50)], origin, new Set(["mid"]), cfg);
    expect(d.toUnload).toEqual([]); // 50 is not > 60
  });

  it("does not reload an unloaded memory sitting in the hysteresis band", () => {
    const d = decideLod([rec("mid", -50)], origin, new Set(), cfg);
    expect(d.toLoad).toEqual([]); // 50 is not <= 40
  });

  it("caps concurrent loads to the nearest N", () => {
    const records = [rec("c", -30), rec("a", -10), rec("b", -20)];
    const d = decideLod(records, origin, new Set(), { ...cfg, maxConcurrentLoads: 2 });
    expect(d.toLoad).toEqual(["a", "b"]); // nearest two, nearest first
  });
});
