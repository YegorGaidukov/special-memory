import type { Geo, Transform, Vec3 } from "@/lib/manifest/types";
import { geoToTransform } from "@/lib/geo/transform";

export interface PlacementInput {
  geo?: Geo;
  cameraPosition?: Vec3;
  cameraForward?: Vec3;
}

/**
 * Decide a fresh upload's world transform with no placement page. EXIF GPS wins
 * (projected to local metres about the city origin). Otherwise drop the memory
 * `standoff` metres in front of the camera. Otherwise (headless / no pose) at
 * the origin — the curator can still move it later in edit mode.
 */
export function placementTransform(
  input: PlacementInput,
  origin: Geo,
  standoff: number,
): Transform {
  if (input.geo && Number.isFinite(input.geo.lat) && Number.isFinite(input.geo.lon)) {
    return geoToTransform(input.geo, origin, 0, 1);
  }

  if (input.cameraPosition && input.cameraForward) {
    const [px, py, pz] = input.cameraPosition;
    const [fx, fy, fz] = input.cameraForward;
    const len = Math.hypot(fx, fy, fz) || 1;
    const position: Vec3 = [
      px + (fx / len) * standoff,
      py + (fy / len) * standoff,
      pz + (fz / len) * standoff,
    ];
    return { position, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
  }

  return { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
}
