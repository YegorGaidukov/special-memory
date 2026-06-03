import { describe, it, expect } from "vitest";
import { geoToTransform } from "@/lib/geo/transform";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("geoToTransform", () => {
  it("places a memory at the origin with default scale and identity yaw", () => {
    const t = geoToTransform(ORIGIN, ORIGIN, 0);
    expect(t.position).toEqual([0, 0, 0]);
    expect(t.quaternion[3]).toBeCloseTo(1, 6);
    expect(t.scale).toEqual([1, 1, 1]);
  });

  it("uses the projected position", () => {
    const t = geoToTransform({ lat: ORIGIN.lat, lon: ORIGIN.lon + 0.01 }, ORIGIN, 0);
    expect(t.position[0]).toBeGreaterThan(0);
    expect(t.position[1]).toBe(0);
  });

  it("applies the heading to the quaternion", () => {
    const t = geoToTransform(ORIGIN, ORIGIN, 90);
    expect(t.quaternion[1]).toBeCloseTo(0.70710678, 6);
  });

  it("expands a scalar scale nudge into a 3-vector", () => {
    expect(geoToTransform(ORIGIN, ORIGIN, 0, 1.5).scale).toEqual([1.5, 1.5, 1.5]);
  });

  it("defaults scale to 1 when omitted", () => {
    expect(geoToTransform(ORIGIN, ORIGIN, 0).scale).toEqual([1, 1, 1]);
  });
});
