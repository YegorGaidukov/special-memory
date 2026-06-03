import { describe, it, expect } from "vitest";
import { toExplorerManifest } from "@/server/publish";
import { parseManifest } from "@/lib/manifest/parse";
import type { ContribStore, ContribRecord } from "@/server/types";

const CITY = { name: "Wolfsburg", origin_lat: 52.4227, origin_lon: 10.7865 };

function rec(id: string, over: Partial<ContribRecord> = {}): ContribRecord {
  return {
    id,
    status: "approved",
    source_image: `${id}.jpg`,
    thumbnail_url: `${id}.jpg`,
    splat_url: `${id}.sog`,
    transform: { position: [1, 0, 2], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    created_at: "2026-06-03T00:00:00.000Z",
    ...over,
  };
}

describe("toExplorerManifest", () => {
  it("includes the city block", () => {
    const store: ContribStore = { records: [] };
    expect(toExplorerManifest(store, CITY).city).toEqual(CITY);
  });

  it("publishes only approved records", () => {
    const store: ContribStore = {
      records: [
        rec("a", { status: "approved" }),
        rec("b", { status: "ready" }),
        rec("c", { status: "uploaded", splat_url: "" }),
        rec("d", { status: "processing", splat_url: "" }),
      ],
    };
    const ids = toExplorerManifest(store, CITY).memories.map((m) => m.id);
    expect(ids).toEqual(["a"]);
  });

  it("drops the server-only source_image field", () => {
    const store: ContribStore = { records: [rec("a")] };
    const m = toExplorerManifest(store, CITY).memories[0] as Record<string, unknown>;
    expect("source_image" in m).toBe(false);
  });

  it("produces a manifest the explorer's strict parser accepts", () => {
    const store: ContribStore = { records: [rec("a"), rec("b", { status: "uploaded" })] };
    const manifest = toExplorerManifest(store, CITY);
    // parseManifest throws on malformed records; round-tripping proves validity.
    const reparsed = parseManifest(JSON.parse(JSON.stringify(manifest)));
    expect(reparsed.memories.map((m) => m.id)).toEqual(["a"]);
  });
});
