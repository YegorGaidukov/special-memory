import { describe, it, expect } from "vitest";
import { deviceOrientationToYawPitch } from "@/lib/control/orientation";

const DEG = Math.PI / 180;

// Wrap-aware signed difference of two angles into (-pi, pi].
function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

describe("deviceOrientationToYawPitch", () => {
  it("a level, upright phone faces the horizon (pitch ~ 0)", () => {
    // Portrait screen, phone held vertical like taking a photo (beta = 90deg).
    const { pitch } = deviceOrientationToYawPitch(0, 90, 0, 0);
    expect(pitch).toBeCloseTo(0, 2);
  });

  it("yaw tracks compass heading 1:1 (and pitch stays put)", () => {
    const a = deviceOrientationToYawPitch(0, 90, 0, 0);
    const b = deviceOrientationToYawPitch(40, 90, 0, 0);
    // A 40deg turn of the phone yaws the view by 40deg.
    expect(Math.abs(angleDiff(b.yaw, a.yaw))).toBeCloseTo(40 * DEG, 2);
    expect(b.pitch).toBeCloseTo(a.pitch, 2);
  });

  it("pitch tracks tilt 1:1 (and yaw stays put)", () => {
    const a = deviceOrientationToYawPitch(0, 90, 0, 0);
    const b = deviceOrientationToYawPitch(0, 60, 0, 0);
    // Tilting the phone 30deg pitches the view by 30deg.
    expect(Math.abs(b.pitch - a.pitch)).toBeCloseTo(30 * DEG, 2);
    expect(Math.abs(angleDiff(b.yaw, a.yaw))).toBeCloseTo(0, 2);
  });

  it("stays finite and in range across screen orientations", () => {
    for (const screen of [0, 90, 180, -90]) {
      const { yaw, pitch } = deviceOrientationToYawPitch(35, 70, 15, screen);
      expect(Number.isFinite(yaw)).toBe(true);
      expect(Number.isFinite(pitch)).toBe(true);
      expect(Math.abs(pitch)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });
});
