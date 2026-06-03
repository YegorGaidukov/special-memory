import { describe, it, expect } from "vitest";
import { patchManifestMemoryTransform } from "@/server/publish";
import type { Transform } from "@/lib/manifest/types";

const NEW: Transform = {
  position: [9, 8, 7],
  quaternion: [0, 0, 0, 1],
  scale: 2,
};

function manifest() {
  return {
    city: { name: "Wolfsburg", origin_lat: 52.4, origin_lon: 10.7 },
    memories: [
      { id: "mem-01", status: "approved", splat_url: "mem-01.sog", transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }, heading_deg: 0 },
      { id: "mem-02", status: "approved", splat_url: "mem-02.sog", transform: { position: [30, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } },
    ],
  };
}

describe("patchManifestMemoryTransform", () => {
  it("replaces the matching memory's transform and reports found", () => {
    const { manifest: out, found } = patchManifestMemoryTransform(manifest(), "mem-02", NEW);
    expect(found).toBe(true);
    const mem = (out.memories as { id: string; transform: Transform }[]).find((m) => m.id === "mem-02");
    expect(mem?.transform).toEqual(NEW);
  });

  it("leaves other memories and their non-transform fields untouched", () => {
    const { manifest: out } = patchManifestMemoryTransform(manifest(), "mem-02", NEW);
    const mems = out.memories as { id: string; transform: Transform; heading_deg?: number }[];
    expect(mems[0].transform.position).toEqual([0, 0, 0]); // mem-01 unchanged
    expect(mems[0].heading_deg).toBe(0); // provenance preserved
    expect((out.city as { name: string }).name).toBe("Wolfsburg");
  });

  it("reports not found for an unknown id and changes nothing", () => {
    const { manifest: out, found } = patchManifestMemoryTransform(manifest(), "nope", NEW);
    expect(found).toBe(false);
    const mems = out.memories as { id: string; transform: Transform }[];
    expect(mems.map((m) => m.transform.scale)).toEqual([[1, 1, 1], [1, 1, 1]]);
  });

  it("tolerates a manifest with no memories array", () => {
    const { found } = patchManifestMemoryTransform({ city: {} }, "mem-01", NEW);
    expect(found).toBe(false);
  });
});
