import type { MemoryRecord } from "@/lib/manifest/types";

// Pure helpers for spatial-audio playback. Which memories have audio (and so are
// candidates for an audio source) is pure; the actual residency reuses decideLod.
// The gain curve mirrors three.js's "linear" distance model so a unit test pins the
// behaviour even though the Web Audio panner computes the real attenuation at runtime.

/** Memories that carry a playable voice note. */
export function selectAudioRecords(records: MemoryRecord[]): MemoryRecord[] {
  return records.filter((r) => typeof r.audio_url === "string" && r.audio_url.length > 0);
}

export interface AudioGainConfig {
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}

/**
 * Gain [0,1] at a given distance under three.js's "linear" distance model:
 *   1 - rolloff * (clamp(d, ref, max) - ref) / (max - ref)
 * Full volume within refDistance, falling to (1 - rolloff) by maxDistance.
 */
export function linearAudioGain(distance: number, cfg: AudioGainConfig): number {
  const { refDistance, maxDistance, rolloffFactor } = cfg;
  if (maxDistance <= refDistance) return distance <= refDistance ? 1 : 0;
  const d = Math.max(refDistance, Math.min(maxDistance, distance));
  const g = 1 - (rolloffFactor * (d - refDistance)) / (maxDistance - refDistance);
  return Math.max(0, Math.min(1, g));
}
