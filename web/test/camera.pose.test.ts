import { describe, it, expect } from "vitest";
import { getCameraPose, setCameraPose } from "@/lib/camera/pose";

describe("camera pose bridge", () => {
  it("defaults to origin looking down -Z", () => {
    const p = getCameraPose();
    expect(p.position).toEqual([0, 0, 0]);
    expect(p.forward).toEqual([0, 0, -1]);
  });

  it("returns the last value written", () => {
    setCameraPose({ position: [1, 2, 3], forward: [0, 0, -1] });
    expect(getCameraPose().position).toEqual([1, 2, 3]);
  });
});
