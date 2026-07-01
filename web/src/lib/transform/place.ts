import type { Transform } from "@/lib/manifest/types";
import type { StoredTransform } from "@/lib/transform/apply";

// Move a memory on the ground plane: return a StoredTransform with its x/z
// replaced by the drop position and everything else (height, orientation,
// scale) preserved. Scale is collapsed to a scalar because the PATCH endpoint
// (`is_valid_transform`) requires a positive number, while a manifest record's
// scale may be a Vec3 (seeds store [1,1,1]); splats are uniformly scaled, so
// scale[0] is the faithful scalar. Shared by the phone (persist) and the
// projector (live overlay edit).
export function groundMove(t: Transform, x: number, z: number): StoredTransform {
  return {
    position: [x, t.position[1], z],
    quaternion: t.quaternion,
    scale: Array.isArray(t.scale) ? t.scale[0] : t.scale,
  };
}
