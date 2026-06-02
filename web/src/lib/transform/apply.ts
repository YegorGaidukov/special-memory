import type { MemoryRecord, Quat, Vec3 } from "@/lib/manifest/types";

/** Arguments handed verbatim to the renderer's addSplatScene (and the billboard). */
export interface SplatSceneArgs {
  position: Vec3;
  /** The renderer calls this `rotation`, but it is a quaternion [x,y,z,w]. */
  rotation: Quat;
  scale: Vec3;
}

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
    rotation: quaternion,
    scale: normalizeScale(scale),
  };
}
