import type { Pose } from "./types";
import { easeInOutCubic, lerpVec3 } from "./tween";

export interface FlySample extends Pose {
  done: boolean;
}

/**
 * Build a fly-to function: given elapsed milliseconds, returns the eased
 * camera pose between `from` and `to`, plus whether the travel has finished.
 * Position and look-at point are interpolated independently (no slerp needed).
 */
export function makeFlyTo(
  from: Pose,
  to: Pose,
  durationMs: number,
): (elapsedMs: number) => FlySample {
  const dur = Math.max(1, durationMs);
  return (elapsedMs: number) => {
    const t = Math.min(1, Math.max(0, elapsedMs / dur));
    const k = easeInOutCubic(t);
    return {
      position: lerpVec3(from.position, to.position, k),
      lookAt: lerpVec3(from.lookAt, to.lookAt, k),
      done: t >= 1,
    };
  };
}
