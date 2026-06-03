import type { MemoryRecord, Quat, Vec3 } from "@/lib/manifest/types";
import { multiplyQuat, conjugateQuat } from "@/lib/math/quat";

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

/** A stored transform with uniform (scalar) scale — what a gizmo edit produces. */
export interface StoredTransform {
  position: Vec3;
  quaternion: Quat;
  scale: number;
}

/**
 * Inverse of {@link toSplatSceneArgs}: read renderer placement args (a mesh's
 * live transform) back into a stored transform. Right-multiplying the rotation
 * by `conjugate(SHARP_TO_THREE)` exactly undoes `toSplatSceneArgs`'s right-
 * multiply by `SHARP_TO_THREE` (q·s·s⁻¹ = q), for any correction quaternion.
 * Scale collapses to a uniform scalar — gizmo edits keep it uniform (see
 * `readMeshTransform`), and SHARP splats are metric, so a single value suffices.
 */
export function fromSplatSceneArgs(args: SplatSceneArgs): StoredTransform {
  return {
    position: args.position,
    quaternion: multiplyQuat(args.rotation, conjugateQuat(SHARP_TO_THREE)),
    scale: args.scale[0],
  };
}

/** Minimal shape of a three.js Object3D transform, so this module stays three-free. */
interface MeshTransform {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

/** Read a live mesh's transform back into a stored transform (gizmo → record). */
export function readMeshTransform(obj: MeshTransform): StoredTransform {
  return fromSplatSceneArgs({
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
    scale: [obj.scale.x, obj.scale.y, obj.scale.z],
  });
}
