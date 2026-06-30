// Projector-side math for the phone "magic window" look. The phone streams its raw
// orientation as {yaw, pitch}; we map it onto the camera *relative to a baseline*
// captured at recenter — so the absolute compass zero never has to be trustworthy and
// the view never jumps when calibrating. Pure + unit-tested; Navigation just calls in.

import type { YawPitch } from "./orientation";

export type { YawPitch };

// Matches the projector's existing pole guard (Navigation clamps pitch to ~±83deg) and
// the backend's PITCH_LIMIT, so phone, wire, and renderer agree.
export const PITCH_LIMIT = 1.45;

// The phone + camera orientations captured when the driver recenters. The camera's
// change tracks the phone's change since these baselines.
export interface Calibration {
  phoneYaw: number;
  phonePitch: number;
  camYaw: number;
  camPitch: number;
}

/** Wrap an angle into [-pi, pi] (exact no-op when already in range). */
export function wrapPi(a: number): number {
  if (a >= -Math.PI && a <= Math.PI) return a;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function clampPitch(p: number): number {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));
}

/** Desired absolute camera yaw/pitch for a raw phone aim, given the recenter baseline. */
export function desiredCameraAngles(aim: YawPitch, cal: Calibration): YawPitch {
  return {
    yaw: wrapPi(cal.camYaw + wrapPi(aim.yaw - cal.phoneYaw)),
    pitch: clampPitch(cal.camPitch + (aim.pitch - cal.phonePitch)),
  };
}

/**
 * Exponentially ease `current` toward `target` along the shortest arc, framerate
 * independent. `tau` is the time-constant (s); larger = lazier. Hides the ~16 Hz aim
 * cadence and sensor jitter.
 */
export function approachAngle(current: number, target: number, delta: number, tau: number): number {
  const alpha = tau <= 0 ? 1 : 1 - Math.exp(-delta / tau);
  return current + wrapPi(target - current) * alpha;
}

// Forward-vector <-> yaw/pitch in the projector's convention (yaw about world-up,
// 0 = down -Z; pitch off the horizon, + = up). Shared so calibration reads the live
// camera heading the same way orientation.ts reduces the phone's.
export function anglesToForward(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function forwardToAngles(x: number, y: number, z: number): YawPitch {
  return { yaw: Math.atan2(x, -z), pitch: Math.asin(Math.max(-1, Math.min(1, y))) };
}
