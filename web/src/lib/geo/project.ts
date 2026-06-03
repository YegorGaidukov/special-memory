import type { Geo, Vec3 } from "@/lib/manifest/types";

// Metres per degree of latitude (roughly constant on a sphere). Longitude metres
// scale by cos(latitude). Equirectangular approximation is accurate enough at
// city extent (the spec's chosen method).
const M_PER_DEG_LAT = 111_320;

/**
 * Project a memory's lat/lon to local world metres relative to the city origin.
 * three.js frame: East = +X, North = -Z, ground plane y = 0.
 */
export function projectToLocal(geo: Geo, origin: Geo): Vec3 {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  const x = (geo.lon - origin.lon) * mPerDegLon;
  const z = -(geo.lat - origin.lat) * M_PER_DEG_LAT;
  return [x, 0, z + 0]; // +0 normalizes -0 to 0 (floating-point quirk)
}
