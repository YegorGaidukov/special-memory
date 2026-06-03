import type { Quat } from "@/lib/manifest/types";

/**
 * Contributor facing-arrow heading (degrees) → world orientation quaternion.
 * Yaw about +Y by the heading angle: [0, sin(rad/2), 0, cos(rad/2)]. The sign
 * convention is locked to the seed manifest (heading 45 → [0,0.38268,0,0.92388])
 * and re-verified visually in the smoke test, just like the SHARP→three frame
 * correction. This is the memory's WORLD orientation; the renderer composes it
 * with the SHARP→three.js correction in lib/transform/apply.ts.
 */
export function headingToQuaternion(headingDeg: number): Quat {
  const half = (headingDeg * Math.PI) / 180 / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

/**
 * Inverse of {@link headingToQuaternion}: extract the yaw (rotation about +Y) of
 * an orientation quaternion and return it as a heading in [0, 360). For the
 * yaw-only quaternions this app stores this is exact; for a freely-rotated gizmo
 * result it returns the yaw component (the curator-meaningful number), which the
 * editor shows as the read-only-ish "heading" — typing a heading snaps back to a
 * pure yaw. Standard yaw extraction: atan2(2(yw + xz), 1 − 2(y² + z²)).
 */
export function quaternionToHeadingDeg(q: Quat): number {
  const [x, y, z, w] = q;
  const yaw = Math.atan2(2 * (y * w + x * z), 1 - 2 * (y * y + z * z));
  const deg = (yaw * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
