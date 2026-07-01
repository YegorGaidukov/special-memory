import { describe, it, expect } from "vitest";
import { parseManifest } from "@/lib/manifest/parse";

function validRaw() {
  return {
    city: { name: "Demo City", origin_lat: 0, origin_lon: 0 },
    memories: [
      {
        id: "mem-01",
        status: "approved",
        thumbnail_url: "a.jpg",
        splat_url: "a.ply",
        captured_at: "2026-06-02T21:59:01Z",
        geo: { lat: 0, lon: 0 },
        heading_deg: 0,
        transform: {
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        created_at: "2026-06-02T22:00:00Z",
      },
    ],
  };
}

describe("parseManifest", () => {
  it("parses a valid manifest into typed city + memories", () => {
    const m = parseManifest(validRaw());
    expect(m.city.name).toBe("Demo City");
    expect(m.memories).toHaveLength(1);
    expect(m.memories[0].id).toBe("mem-01");
    expect(m.memories[0].transform.position).toEqual([0, 0, 0]);
    expect(m.memories[0].transform.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("parses the optional name when present", () => {
    const raw = validRaw();
    (raw.memories[0] as Record<string, unknown>).name = "The Pier";
    expect(parseManifest(raw).memories[0].name).toBe("The Pier");
  });

  it("leaves name undefined when absent", () => {
    expect(parseManifest(validRaw()).memories[0].name).toBeUndefined();
  });

  it("throws when a memory is missing its transform", () => {
    const raw = validRaw();
    delete (raw.memories[0] as Record<string, unknown>).transform;
    expect(() => parseManifest(raw)).toThrow(/transform/i);
  });

  it("throws when position does not have exactly 3 components", () => {
    const raw = validRaw();
    raw.memories[0].transform.position = [0, 0] as unknown as number[];
    expect(() => parseManifest(raw)).toThrow(/position/i);
  });

  it("throws when quaternion does not have exactly 4 components", () => {
    const raw = validRaw();
    raw.memories[0].transform.quaternion = [0, 0, 1] as unknown as number[];
    expect(() => parseManifest(raw)).toThrow(/quaternion/i);
  });

  it("throws when memories is not an array", () => {
    const raw = { city: validRaw().city, memories: {} };
    expect(() => parseManifest(raw)).toThrow(/memories/i);
  });

  it("filters out memories that have no splat yet (uploaded/processing/failed)", () => {
    const raw = validRaw();
    raw.memories.push({ ...structuredClone(raw.memories[0]), id: "mem-proc", status: "processing" });
    raw.memories.push({ ...structuredClone(raw.memories[0]), id: "mem-fail", status: "failed" });
    const m = parseManifest(raw);
    expect(m.memories.map((r) => r.id)).toEqual(["mem-01"]);
  });

  it("keeps both ready and approved memories", () => {
    const raw = validRaw();
    raw.memories.push({ ...structuredClone(raw.memories[0]), id: "mem-ready", status: "ready" });
    const m = parseManifest(raw);
    expect(m.memories.map((r) => r.id)).toEqual(["mem-01", "mem-ready"]);
  });

  it("accepts a memory without geo / heading / captured_at (EXIF-less photo)", () => {
    const raw = validRaw();
    const m = raw.memories[0] as Record<string, unknown>;
    delete m.geo;
    delete m.heading_deg;
    delete m.captured_at;
    const parsed = parseManifest(raw);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].geo).toBeUndefined();
  });

  it("accepts a scalar scale", () => {
    const raw = validRaw();
    raw.memories[0].transform.scale = 2 as unknown as number[];
    const m = parseManifest(raw);
    expect(m.memories[0].transform.scale).toBe(2);
  });
});
