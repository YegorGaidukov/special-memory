import { describe, it, expect } from "vitest";
import {
  PITCH_LIMIT,
  wrapPi,
  desiredCameraAngles,
  approachAngle,
  anglesToForward,
  forwardToAngles,
  type Calibration,
} from "@/lib/control/aim";

const cal = (over: Partial<Calibration> = {}): Calibration => ({
  phoneYaw: 0,
  phonePitch: 0,
  camYaw: 0,
  camPitch: 0,
  ...over,
});

describe("wrapPi", () => {
  it("leaves in-range angles untouched", () => {
    expect(wrapPi(1.2)).toBe(1.2);
  });
  it("wraps past +pi to the negative side", () => {
    expect(wrapPi(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 9);
  });
});

describe("desiredCameraAngles", () => {
  it("maps the baseline phone pose back to the camera baseline (no jump on recenter)", () => {
    const c = cal({ phoneYaw: 1.0, phonePitch: 0.2, camYaw: -2.0, camPitch: 0.3 });
    const d = desiredCameraAngles({ yaw: 1.0, pitch: 0.2 }, c);
    expect(d.yaw).toBeCloseTo(-2.0, 9);
    expect(d.pitch).toBeCloseTo(0.3, 9);
  });

  it("applies the phone's change since baseline to the camera 1:1", () => {
    const c = cal({ phoneYaw: 1.0, camYaw: -2.0 });
    const d = desiredCameraAngles({ yaw: 1.5, pitch: 0.0 }, c); // +0.5 turn
    expect(d.yaw).toBeCloseTo(-1.5, 9); // -2.0 + 0.5
  });

  it("wraps the resulting yaw into [-pi, pi]", () => {
    const c = cal({ phoneYaw: 0, camYaw: 3.0 });
    const d = desiredCameraAngles({ yaw: 0.3, pitch: 0 }, c); // 3.0 + 0.3 = 3.3 -> wrap
    expect(d.yaw).toBeCloseTo(wrapPi(3.3), 9);
    expect(Math.abs(d.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  it("clamps pitch to the pole limit", () => {
    const c = cal({ camPitch: 1.4 });
    expect(desiredCameraAngles({ yaw: 0, pitch: 0.5 }, c).pitch).toBeCloseTo(PITCH_LIMIT, 9);
    const c2 = cal({ camPitch: -1.4 });
    expect(desiredCameraAngles({ yaw: 0, pitch: -0.5 }, c2).pitch).toBeCloseTo(-PITCH_LIMIT, 9);
  });
});

describe("approachAngle", () => {
  it("moves a fraction 1 - e^-1 toward the target after one time-constant", () => {
    expect(approachAngle(0, 1, 0.1, 0.1)).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it("converges to the target over repeated steps", () => {
    let a = 0;
    for (let i = 0; i < 200; i++) a = approachAngle(a, 1.2, 0.016, 0.08);
    expect(a).toBeCloseTo(1.2, 4);
  });

  it("takes the short way around the wrap seam", () => {
    // From 3.0 toward -3.0 the short arc is +0.28 across +pi, not -6.0.
    const next = approachAngle(3.0, -3.0, 1.0, 0.01); // alpha ~ 1, basically jump
    expect(Math.abs(wrapPi(next - -3.0))).toBeLessThan(1e-3);
  });
});

describe("anglesToForward / forwardToAngles round-trip", () => {
  it("yaw=pitch=0 looks down -Z", () => {
    const f = anglesToForward(0, 0);
    expect(f.x).toBeCloseTo(0, 9);
    expect(f.y).toBeCloseTo(0, 9);
    expect(f.z).toBeCloseTo(-1, 9);
  });

  it("round-trips representative angles", () => {
    for (const [yaw, pitch] of [
      [0.7, 0.3],
      [-1.2, -0.4],
      [2.5, 0.1],
    ]) {
      const f = anglesToForward(yaw, pitch);
      const a = forwardToAngles(f.x, f.y, f.z);
      expect(a.yaw).toBeCloseTo(yaw, 9);
      expect(a.pitch).toBeCloseTo(pitch, 9);
    }
  });
});
