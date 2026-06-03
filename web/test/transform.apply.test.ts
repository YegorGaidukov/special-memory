import { describe, it, expect } from "vitest";
import {
  toSplatSceneArgs,
  fromSplatSceneArgs,
  readMeshTransform,
  normalizeScale,
} from "@/lib/transform/apply";
import type { MemoryRecord, Quat } from "@/lib/manifest/types";

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

function expectQuatClose(actual: Quat, expected: Quat) {
  for (let i = 0; i < 4; i++) expect(actual[i]).toBeCloseTo(expected[i], 6);
}

describe("fromSplatSceneArgs", () => {
  it("round-trips toSplatSceneArgs for an arbitrary orientation and scale", () => {
    const q: Quat = [0, 0.7071, 0, 0.7071]; // 90° about Y
    const back = fromSplatSceneArgs(toSplatSceneArgs(record({ quaternion: q, scale: 2 })));
    expect(back.position).toEqual([1, 2, 3]);
    expectQuatClose(back.quaternion, q);
    expect(back.scale).toBeCloseTo(2, 6);
  });

  it("round-trips an identity orientation back to identity", () => {
    const back = fromSplatSceneArgs(toSplatSceneArgs(record({ quaternion: [0, 0, 0, 1] })));
    expectQuatClose(back.quaternion, [0, 0, 0, 1]);
  });

  it("collapses a 3-vector scale to its first (uniform) component", () => {
    const back = fromSplatSceneArgs(toSplatSceneArgs(record({ scale: [3, 3, 3] })));
    expect(back.scale).toBeCloseTo(3, 6);
  });
});

describe("readMeshTransform", () => {
  it("reads a live mesh transform back through the inverse mapping", () => {
    // A mesh placed by toSplatSceneArgs from an identity-orientation record:
    // rotation becomes the SHARP->three correction [1,0,0,0]; reading it back
    // must recover the stored identity quaternion.
    const mesh = {
      position: { x: 5, y: -1, z: 2 },
      quaternion: { x: 1, y: 0, z: 0, w: 0 },
      scale: { x: 1.5, y: 1.5, z: 1.5 },
    };
    const back = readMeshTransform(mesh);
    expect(back.position).toEqual([5, -1, 2]);
    expectQuatClose(back.quaternion, [0, 0, 0, 1]);
    expect(back.scale).toBeCloseTo(1.5, 6);
  });
});
