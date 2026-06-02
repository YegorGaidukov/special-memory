import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";

export interface PickOptions {
  /** Half-angle of the selection cone around the view direction (radians). */
  maxAngleRad: number;
  /** Ignore memories farther than this. */
  maxDist: number;
}

/**
 * Choose the memory the camera is looking at: the one with the smallest angle
 * to the view direction, within the cone and range. Forgiving "look at it and
 * click" selection — no exact raycast against splat geometry needed.
 */
export function pickMemory(
  records: MemoryRecord[],
  origin: Vec3,
  viewDir: Vec3,
  opts: PickOptions,
): MemoryRecord | null {
  const vlen = Math.hypot(viewDir[0], viewDir[1], viewDir[2]) || 1;
  const v: Vec3 = [viewDir[0] / vlen, viewDir[1] / vlen, viewDir[2] / vlen];

  let best: MemoryRecord | null = null;
  let bestAngle = opts.maxAngleRad;

  for (const r of records) {
    const p = r.transform.position;
    const to: Vec3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
    const d = Math.hypot(to[0], to[1], to[2]);
    if (d < 1e-6 || d > opts.maxDist) continue;
    const dot = (v[0] * to[0] + v[1] * to[1] + v[2] * to[2]) / d;
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (angle <= bestAngle) {
      bestAngle = angle;
      best = r;
    }
  }
  return best;
}
