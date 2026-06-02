import type { Vec3 } from "@/lib/manifest/types";

/** A camera pose expressed as a position and a point it looks at. */
export interface Pose {
  position: Vec3;
  lookAt: Vec3;
}
