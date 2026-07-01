import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";
import { quaternionToHeadingDeg } from "@/lib/geo/heading";
import type { Pose } from "./types";

/**
 * Camera pose that reproduces the photographer's viewpoint: stand `standoff`
 * units back on the side the photo was taken from, looking along the memory's
 * heading toward it. A memory's `transform.position` is the splat's local origin
 * (≈ the photographer's eye) and its content extends along the heading, so world
 * "forward" for heading θ is (-sin θ, 0, -cos θ); the camera sits at
 * `position - forward·standoff` looking back at `position`. This keeps you on the
 * dense front of the single-image "peek-around" splat instead of its hollow back.
 *
 * Heading comes from the stored quaternion via `quaternionToHeadingDeg` (yaw
 * component), so gizmo-edited memories work too. Memories with a default/unset
 * heading (0) get a consistent +Z-side approach — still deterministic, unlike the
 * old "approach from wherever the camera happens to be".
 */
export function framePoseForRecord(record: MemoryRecord, standoff: number): Pose {
  const target = record.transform.position;
  const rad = (quaternionToHeadingDeg(record.transform.quaternion) * Math.PI) / 180;
  const forward: Vec3 = [-Math.sin(rad), 0, -Math.cos(rad)];
  return {
    position: [
      target[0] - forward[0] * standoff,
      target[1] - forward[1] * standoff,
      target[2] - forward[2] * standoff,
    ],
    lookAt: target,
  };
}
