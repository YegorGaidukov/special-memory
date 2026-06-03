import type { MemoryRecord, Quat, Vec3 } from "@/lib/manifest/types";
import { multiplyQuat } from "@/lib/math/quat";

/** Placement args applied to a memory's Spark SplatMesh (and its point-cloud preview). */
export interface SplatSceneArgs {
  position: Vec3;
  /** The renderer calls this `rotation`, but it is a quaternion [x,y,z,w]. */
  rotation: Quat;
  scale: Vec3;
}

// SHARP emits splats in a computer-vision frame (Y-down, +Z forward); three.js
// is Y-up / -Z forward. Converting between them is a 180° rotation about X, i.e.
// the quaternion [1,0,0,0]. Applied to each splat's local geometry, BEFORE the
// memory's own world orientation. Verified visually against the sample splat.
const SHARP_TO_THREE: Quat = [1, 0, 0, 0];

/** Expand a scalar scale to a 3-vector; pass an existing 3-vector through. */
export function normalizeScale(scale: Vec3 | number): Vec3 {
  return typeof scale === "number" ? [scale, scale, scale] : scale;
}

/**
 * Map a memory's stored transform onto renderer placement args. This is a pure
 * pass-through: position and orientation come straight from `transform`, with no
 * geo/heading math — that resolution already happened at contribution time (S3).
 */
export function toSplatSceneArgs(record: MemoryRecord): SplatSceneArgs {
  const { position, quaternion, scale } = record.transform;
  return {
    position,
    rotation: multiplyQuat(quaternion, SHARP_TO_THREE),
    scale: normalizeScale(scale),
  };
}
