import type { Geo } from "@/lib/manifest/types";

// Must match lib/geo/project's equirectangular model so the texture lines up
// with where memories project.
const M_PER_DEG_LAT = 111_320;

export interface GroundExtent {
  /** Plane size in world metres (square, centered on the origin). */
  size: number;
  /** Geographic bounds [west, south, east, north] for MapLibre to render. */
  bounds: [number, number, number, number];
}

/**
 * A square ground `spanMeters` on a side, centered on the city origin. Returns
 * the world-space plane size and the lon/lat bbox MapLibre must draw so the map
 * texture aligns with the memories above it.
 */
export function groundExtent(origin: Geo, spanMeters: number): GroundExtent {
  const half = spanMeters / 2;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  const dLat = half / M_PER_DEG_LAT;
  const dLon = half / mPerDegLon;
  return {
    size: spanMeters,
    bounds: [origin.lon - dLon, origin.lat - dLat, origin.lon + dLon, origin.lat + dLat],
  };
}
