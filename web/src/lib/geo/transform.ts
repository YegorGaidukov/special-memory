import type { Geo, Transform } from "@/lib/manifest/types";
import { projectToLocal } from "./project";
import { headingToQuaternion } from "./heading";

/**
 * The geo math S2 deliberately doesn't do: turn a memory's real-world placement
 * (lat/lon + contributor heading + optional scale nudge) into the stored
 * `transform` the explorer reads verbatim. SHARP's metric scale means the
 * default scale is 1; the nudge is a multiplier for taste.
 */
export function geoToTransform(
  geo: Geo,
  origin: Geo,
  headingDeg: number,
  scale: number = 1,
): Transform {
  return {
    position: projectToLocal(geo, origin),
    quaternion: headingToQuaternion(headingDeg),
    scale: [scale, scale, scale],
  };
}
