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
