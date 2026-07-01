// Central explorer tuning. The base URL is the only place that knows where
// memory assets live (the FastAPI backend's /assets, served same-origin behind
// Caddy in production; a separate :8000 backend in dev — see lib/api/baseUrl).
import { OSM_STYLE } from "@/lib/map/style";
import { getAssetsBaseUrl } from "@/lib/api/baseUrl";

// Memory assets (splats / previews / thumbnails / audio / manifest) are served by
// the backend's GET /assets/{name}, which reads PUBLIC_MEMORIES_DIR from disk per
// request — so a live drop's .sog (written at runtime by inline reconstruction) is
// served without rebuilding the static frontend. NEXT_PUBLIC_MEMORIES_BASE_URL
// overrides it (e.g. a CDN for the exhibition).
export const MEMORIES_BASE_URL =
  process.env.NEXT_PUBLIC_MEMORIES_BASE_URL ?? getAssetsBaseUrl();

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
export const PREVIEW = { pointSize: 0.12, fadeMs: 800 } as const;

// How often (ms) to re-evaluate splat residency as the cameraw moves. The check
// is cheap (distance compares), so this just avoids running it every frame.
export const RESIDENCY_TICK_MS = 200;

// Spatial audio (S4): a memory's voice note plays as positional audio that gets
// louder as the camera nears it. loadRadius/disposeRadius drive residency (reusing
// decideLod) — audio carries a bit farther than the splat. The panner uses the
// linear distance model: full volume within refDistance, ~silent by maxDistance.
export const AUDIO = {
  loadRadius: 60,
  disposeRadius: 90,
  maxConcurrent: 4,
  refDistance: 6,
  maxDistance: 60,
  rolloffFactor: 1,
} as const;

// Free-fly movement. baseSpeed is metres/second of WASD flight; holding Shift
// multiplies it by boost for quick traversal across the city.
export const FLY = { baseSpeed: 5, boost: 4 } as const;

// Phone joystick (S4): how fast a full look-stick deflection turns the projected
// view (radians/second of yaw / pitch). Movement reuses FLY.baseSpeed. `lookExpo`
// (0..1) is the touch look-stick response curve — higher is gentler near centre for
// fine control, with full deflection still reaching full speed (see applyExpo).
// `aimTau` is the smoothing time-constant (seconds) for the gyro "magic window"
// look — larger eases harder, hiding the ~16 Hz aim cadence and sensor jitter at
// the cost of lag.
export const CONTROL = { lookYaw: 1.6, lookPitch: 1.2, lookExpo: 0.65, aimTau: 0.1 } as const;

// Click-to-travel framing.
export const FLY_TO_DURATION_MS = 1400;
// Metres back from the memory origin along its heading when arriving (see
// framePoseForRecord). Positive = stand on the photographer's side looking at it;
// negative = arrive on the content side, looking back toward the origin.
export const FLY_TO_STANDOFF = 0.1;

// The one chosen city. Origin is Wolfsburg city centre (Rathaus); geo placement
// (S3) projects each memory's lat/lon to local metres relative to this point.
// Shared by the contribution flow and written into the explorer manifest.
export const CITY = {
  name: "Wolfsburg",
  origin_lat: 52.4227,
  origin_lon: 10.7865,
} as const;

// Faint in-world map laid under the memories, aligned to the same geo projection.
// Styling is config-only (no in-app restyle UI); the explorer toggles visibility.
// `spanMeters` is the ground extent; `opacity`/`tint` make it "barely visible".
export const MAP = {
  enabled: false,
  style: OSM_STYLE,
  spanMeters: 4000,
  textureSize: 4096,
  opacity: 0.18,
  tint: "#3a4a66",
  y: 0,
} as const;
