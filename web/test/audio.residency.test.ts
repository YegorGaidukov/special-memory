import { describe, it, expect } from "vitest";
import { selectAudioRecords, linearAudioGain } from "@/lib/audio/residency";
import type { MemoryRecord } from "@/lib/manifest/types";

function rec(id: string, audio_url?: string): MemoryRecord {
  return {
    id,
    status: "approved",
    thumbnail_url: "",
    splat_url: `${id}.sog`,
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: 1 },
    ...(audio_url !== undefined ? { audio_url } : {}),
  };
}

describe("selectAudioRecords", () => {
  it("keeps only memories with a non-empty audio_url", () => {
    const out = selectAudioRecords([rec("a", "a.webm"), rec("b"), rec("c", ""), rec("d", "d.m4a")]);
    expect(out.map((r) => r.id)).toEqual(["a", "d"]);
  });
});

describe("linearAudioGain", () => {
  const cfg = { refDistance: 6, maxDistance: 60, rolloffFactor: 1 };

  it("is full volume within refDistance", () => {
    expect(linearAudioGain(0, cfg)).toBe(1);
    expect(linearAudioGain(6, cfg)).toBe(1);
  });

  it("falls off linearly to ~0 by maxDistance", () => {
    expect(linearAudioGain(60, cfg)).toBeCloseTo(0, 6);
    expect(linearAudioGain(33, cfg)).toBeCloseTo(0.5, 6); // midpoint
  });

  it("clamps beyond maxDistance", () => {
    expect(linearAudioGain(1000, cfg)).toBe(0);
  });

  it("respects a partial rolloff (never reaches silence)", () => {
    expect(linearAudioGain(60, { ...cfg, rolloffFactor: 0.5 })).toBeCloseTo(0.5, 6);
  });

  it("degenerate ref>=max: on/off at ref", () => {
    expect(linearAudioGain(5, { refDistance: 10, maxDistance: 10, rolloffFactor: 1 })).toBe(1);
    expect(linearAudioGain(11, { refDistance: 10, maxDistance: 10, rolloffFactor: 1 })).toBe(0);
  });
});
