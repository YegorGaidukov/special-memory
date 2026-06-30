// Pure joystick/look input math for the phone Drive mode. Maps a finger offset from
// the control's origin into a normalized [-1,1] vector with a dead-zone and a clamped
// magnitude (so the analog stick can't exceed full deflection). Screen coordinates:
// +x right, +y DOWN. Callers decide the meaning per axis (the move stick flips y so
// "up" is forward; the look area keeps y so "down" looks down).

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * @param dx finger x offset from the stick origin (px)
 * @param dy finger y offset from the stick origin (px, +down)
 * @param radius full-deflection distance (px)
 * @param deadzone fraction of the radius treated as no input (default 0.12)
 */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
  deadzone = 0.12,
): Vec2 {
  if (radius <= 0) return { x: 0, y: 0 };
  let x = dx / radius;
  let y = dy / radius;
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return { x: 0, y: 0 };
  if (mag > 1) {
    x /= mag;
    y /= mag;
  }
  return { x, y };
}
