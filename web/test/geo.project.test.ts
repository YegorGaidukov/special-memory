import { describe, it, expect } from "vitest";
import { projectToLocal } from "@/lib/geo/project";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("projectToLocal", () => {
  it("maps the origin to the world origin", () => {
    expect(projectToLocal(ORIGIN, ORIGIN)).toEqual([0, 0, 0]);
  });

  it("keeps memories on the ground plane (y = 0)", () => {
    expect(projectToLocal({ lat: 52.43, lon: 10.79 }, ORIGIN)[1]).toBe(0);
  });

  it("puts a point east of origin at +X", () => {
    const [x] = projectToLocal({ lat: ORIGIN.lat, lon: ORIGIN.lon + 0.01 }, ORIGIN);
    expect(x).toBeGreaterThan(0);
  });

  it("puts a point north of origin at -Z", () => {
    const [, , z] = projectToLocal({ lat: ORIGIN.lat + 0.01, lon: ORIGIN.lon }, ORIGIN);
    expect(z).toBeLessThan(0);
  });

  it("uses ~111320 m per degree latitude", () => {
    const [, , z] = projectToLocal({ lat: ORIGIN.lat + 1, lon: ORIGIN.lon }, ORIGIN);
    expect(-z).toBeCloseTo(111320, 0);
  });

  it("shrinks longitude metres by cos(latitude)", () => {
    const [x] = projectToLocal({ lat: ORIGIN.lat, lon: ORIGIN.lon + 1 }, ORIGIN);
    const expected = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
    expect(x).toBeCloseTo(expected, 0);
  });
});
