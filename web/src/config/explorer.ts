// Central explorer tuning. The base URL is the only place that knows where
// memory assets live (dev public/ folder vs. a CDN for the exhibition).
export const MEMORIES_BASE_URL =
  process.env.NEXT_PUBLIC_MEMORIES_BASE_URL ?? "/memories";

export const MANIFEST_URL = `${MEMORIES_BASE_URL.replace(/\/+$/, "")}/manifest.json`;

// LOD distances (metres). disposeRadius > loadRadius leaves a hysteresis gap so a
// memory hovering near the boundary doesn't thrash between loaded and disposed.
// Tuned in Step 8/10 against the real splat scale.
export const LOD = {
  loadRadius: 40,
  disposeRadius: 60,
  maxConcurrentLoads: 2,
} as const;

// Click-to-travel framing.
export const FLY_TO_DURATION_MS = 1400;
export const FLY_TO_STANDOFF = 12; // metres from a memory when arriving

// "Look at it and click" selection: cone half-angle + max range.
export const PICK = { maxAngleRad: 0.4, maxDist: 1000 } as const;
