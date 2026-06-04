import { describe, it, expect } from "vitest";
import { groundExtent } from "@/lib/map/extent";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("groundExtent", () => {
  it("returns the span as the world plane size", () => {
    expect(groundExtent(ORIGIN, 4000).size).toBe(4000);
  });

  it("returns a lon/lat bbox centered on the origin", () => {
    const { bounds } = groundExtent(ORIGIN, 4000);
    const [west, south, east, north] = bounds;
    // Symmetric about the origin.
    expect((west + east) / 2).toBeCloseTo(ORIGIN.lon, 6);
    expect((south + north) / 2).toBeCloseTo(ORIGIN.lat, 6);
    // 2 km half-span north ≈ 2000 / 111320 degrees of latitude.
    expect(north - ORIGIN.lat).toBeCloseTo(2000 / 111320, 6);
    // Longitude degrees are wider-spaced (divided by cos(lat)), so dLon > dLat.
    expect(east - ORIGIN.lon).toBeGreaterThan(north - ORIGIN.lat);
  });
});
