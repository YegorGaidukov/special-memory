import { describe, it, expect } from "vitest";
import { placementTransform } from "@/lib/upload/placement";

const ORIGIN = { lat: 52.4227, lon: 10.7865 };

describe("placementTransform", () => {
  it("uses EXIF GPS when present (projected, identity-ish orientation)", () => {
    const t = placementTransform({ geo: ORIGIN }, ORIGIN, 10);
    // At the origin the projection is [0,0,0]; heading 0 → identity quaternion.
    expect(t.position).toEqual([0, 0, 0]);
    expect(t.quaternion).toEqual([0, 0, 0, 1]);
    expect(t.scale).toEqual([1, 1, 1]);
  });

  it("drops in front of the camera when there is no GPS", () => {
    const t = placementTransform(
      { cameraPosition: [0, 5, 0], cameraForward: [0, 0, -2] }, // forward not unit-length
      ORIGIN,
      10,
    );
    // Forward normalized to [0,0,-1], scaled by standoff 10, added to position.
    expect(t.position[0]).toBeCloseTo(0, 6);
    expect(t.position[1]).toBeCloseTo(5, 6);
    expect(t.position[2]).toBeCloseTo(-10, 6);
    expect(t.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("falls back to the origin when neither GPS nor camera pose is given", () => {
    const t = placementTransform({}, ORIGIN, 10);
    expect(t.position).toEqual([0, 0, 0]);
  });
});
