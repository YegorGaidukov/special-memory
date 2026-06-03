import { describe, it, expect } from "vitest";
import { toExplorerManifest, mergeManifest } from "@/server/publish";
import { parseManifest } from "@/lib/manifest/parse";
import type { ContribStore, ContribRecord } from "@/server/types";
import type { MemoryRecord } from "@/lib/manifest/types";

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
    const m = toExplorerManifest(store, CITY).memories[0] as unknown as Record<string, unknown>;
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

// A hand-authored / seed manifest entry (a MemoryRecord, NOT in the S3 store).
function seed(id: string): MemoryRecord {
  return {
    id,
    status: "approved",
    thumbnail_url: `${id}.jpg`,
    splat_url: `${id}.sog`,
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

describe("mergeManifest", () => {
  it("preserves existing manifest entries not managed by the S3 store (hand-authored seed)", () => {
    const existing = [seed("mem-01"), seed("mem-02")];
    const ids = mergeManifest(existing, { records: [] }, CITY).memories.map((m) => m.id);
    expect(ids).toEqual(["mem-01", "mem-02"]);
  });

  it("appends the store's approved records after the external entries", () => {
    const existing = [seed("mem-01")];
    const store = { records: [rec("up-1", { status: "approved" })] };
    expect(mergeManifest(existing, store, CITY).memories.map((m) => m.id)).toEqual(["mem-01", "up-1"]);
  });

  it("replaces (does not duplicate) an existing entry whose id is now S3-managed", () => {
    const existing = [seed("up-1"), seed("mem-01")];
    const store = { records: [rec("up-1", { status: "approved", splat_url: "up-1.sog" })] };
    const out = mergeManifest(existing, store, CITY).memories;
    expect(out.filter((m) => m.id === "up-1")).toHaveLength(1);
    expect(out.map((m) => m.id)).toEqual(["mem-01", "up-1"]);
  });

  it("drops a store-managed id that is no longer approved, even if a stale external entry exists", () => {
    const existing = [seed("up-1")];
    const store = { records: [rec("up-1", { status: "processing", splat_url: "" })] };
    expect(mergeManifest(existing, store, CITY).memories.map((m) => m.id)).toEqual([]);
  });

  it("produces a manifest the explorer's strict parser accepts", () => {
    const merged = mergeManifest([seed("mem-01")], { records: [rec("up-1")] }, CITY);
    const reparsed = parseManifest(JSON.parse(JSON.stringify(merged)));
    expect(reparsed.memories.map((m) => m.id)).toEqual(["mem-01", "up-1"]);
  });
});
