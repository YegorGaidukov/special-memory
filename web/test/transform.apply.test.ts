import { describe, it, expect } from "vitest";
import { toSplatSceneArgs, normalizeScale } from "@/lib/transform/apply";
import type { MemoryRecord } from "@/lib/manifest/types";

function record(over: Partial<MemoryRecord["transform"]> = {}): MemoryRecord {
  return {
    id: "mem-01",
    status: "approved",
    thumbnail_url: "a.jpg",
    splat_url: "a.ply",
    transform: {
      position: [1, 2, 3],
      quaternion: [0, 0.7071, 0, 0.7071],
      scale: [1, 1, 1],
      ...over,
    },
  };
}

describe("normalizeScale", () => {
  it("expands a scalar scale into a 3-vector", () => {
    expect(normalizeScale(2)).toEqual([2, 2, 2]);
  });

  it("passes a 3-vector scale through unchanged", () => {
    expect(normalizeScale([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("toSplatSceneArgs", () => {
  it("passes position straight through (no geo math)", () => {
    expect(toSplatSceneArgs(record()).position).toEqual([1, 2, 3]);
  });

  it("applies the SHARP->three.js (180° about X) correction to an identity orientation", () => {
    expect(toSplatSceneArgs(record({ quaternion: [0, 0, 0, 1] })).rotation).toEqual([
      1, 0, 0, 0,
    ]);
  });

  it("composes the memory orientation with the correction (memory ∘ correction)", () => {
    // 180° about Y composed with the 180°-about-X correction = 180° about Z.
    expect(toSplatSceneArgs(record({ quaternion: [0, 1, 0, 0] })).rotation).toEqual([
      0, 0, -1, 0,
    ]);
  });

  it("normalizes scale to a 3-vector", () => {
    expect(toSplatSceneArgs(record({ scale: 2 })).scale).toEqual([2, 2, 2]);
  });

  it("ignores geo and heading entirely (placement comes only from transform)", () => {
    const withGeo = { ...record(), geo: { lat: 51.5, lon: -0.12 }, heading_deg: 270 };
    const withoutGeo = record();
    expect(toSplatSceneArgs(withGeo)).toEqual(toSplatSceneArgs(withoutGeo));
  });
});
