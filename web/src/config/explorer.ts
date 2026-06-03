// Central explorer tuning. The base URL is the only place that knows where
// memory assets live (dev public/ folder vs. a CDN for the exhibition).
export const MEMORIES_BASE_URL =
  process.env.NEXT_PUBLIC_MEMORIES_BASE_URL ?? "/memories";

export const MANIFEST_URL = `${MEMORIES_BASE_URL.replace(/\/+$/, "")}/manifest.json`;

// LOD distances (metres). disposeRadius > loadRadius leaves a hysteresis gap so a
// memory hovering near the boundary doesn't thrash between loaded and disposed.
// Tuned in Step 8/10 against the real splat scale.
export const LOD = {
  loadRadius: 30,
  disposeRadius: 60,
  maxConcurrentLoads: 2,
} as const;

// A distant memory shows a cheap decimated point cloud (its `.preview.ply`)
// until the camera flies within LOD.loadRadius, when it resolves into the full
// splat. pointSize is the world-space size of each preview point (metres,
// distance-attenuated). On load, the point cloud cross-dissolves into the splat
// over fadeMs. Point count is fixed at build time by `convert-splats`.
export const PREVIEW = { pointSize: 0.12, fadeMs: 2500 } as const;

// How often (ms) to re-evaluate splat residency as the cameraw moves. The check
// is cheap (distance compares), so this just avoids running it every frame.
export const RESIDENCY_TICK_MS = 200;

// Free-fly movement. baseSpeed is metres/second of WASD flight; holding Shift
// multiplies it by boost for quick traversawwwl across the city.
export const FLY = { baseSpeed: 5, boost: 4 } as const;

// Click-to-travel framing.
export const FLY_TO_DURATION_MS = 1400;
export const FLY_TO_STANDOFF = 10; // metres from a memory when arriving

// The one chosen city. Origin is Wolfsburg city centre (Rathaus); geo placement
// (S3) projects each memory's lat/lon to local metres relative to this point.
// Shared by the contribution flow and written into the explorer manifest.
export const CITY = {
  name: "Wolfsburg",
  origin_lat: 52.4227,
  origin_lon: 10.7865,
} as const;
