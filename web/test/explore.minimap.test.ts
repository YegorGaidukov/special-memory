import { describe, it, expect } from "vitest";
import { worldBounds, fitView, project, unproject, clampZoom, zoomAboutPoint } from "@/lib/explore/minimap";

describe("worldBounds", () => {
  it("is null for an empty set", () => {
    expect(worldBounds([])).toBeNull();
  });

  it("spans the extremes", () => {
    expect(
      worldBounds([
        { x: -5, z: 2 },
        { x: 10, z: -8 },
        { x: 3, z: 4 },
      ]),
    ).toEqual({ minX: -5, maxX: 10, minZ: -8, maxZ: 4 });
  });
});

describe("fitView + project", () => {
  it("maps the world centre to the viewport centre", () => {
    const bounds = { minX: 0, maxX: 100, minZ: -50, maxZ: 50 };
    const view = fitView(bounds, 300, 600);
    const p = project(50, 0, view); // centre of bounds
    expect(p.x).toBeCloseTo(150, 6);
    expect(p.y).toBeCloseTo(300, 6);
  });

  it("is north-up: smaller Z (North) sits higher on screen", () => {
    const bounds = { minX: -10, maxX: 10, minZ: -100, maxZ: 100 };
    const view = fitView(bounds, 300, 600);
    const north = project(0, -80, view);
    const south = project(0, 80, view);
    expect(north.y).toBeLessThan(south.y);
  });

  it("preserves aspect ratio (uses one uniform scale)", () => {
    const bounds = { minX: 0, maxX: 200, minZ: 0, maxZ: 100 };
    const view = fitView(bounds, 300, 600, { padding: 0 });
    // Width is the binding dimension: 300/200 = 1.5 px/m, capped by maxScale.
    expect(view.scale).toBeCloseTo(1.5, 6);
  });

  it("caps scale so a tight cluster doesn't explode", () => {
    const bounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    const view = fitView(bounds, 300, 600, { maxScale: 6 });
    expect(view.scale).toBe(6);
  });

  it("returns a neutral view for null bounds", () => {
    const view = fitView(null, 300, 600);
    expect(project(0, 0, view)).toEqual({ x: 150, y: 300 });
  });

  it("applies pan offset", () => {
    const view = { scale: 2, centerX: 0, centerZ: 0, panX: 20, panY: -10, width: 300, height: 600 };
    expect(project(0, 0, view)).toEqual({ x: 170, y: 290 });
  });
});

describe("clampZoom", () => {
  it("clamps to the range", () => {
    expect(clampZoom(0.1, 0.6, 12)).toBe(0.6);
    expect(clampZoom(50, 0.6, 12)).toBe(12);
    expect(clampZoom(3, 0.6, 12)).toBe(3);
  });
});

describe("zoomAboutPoint", () => {
  it("keeps the world point under the focal point fixed across a zoom change", () => {
    const base = { scale: 2, centerX: 0, centerZ: 0, panX: 0, panY: 0, width: 300, height: 600 };
    const focal = project(10, 5, base); // some world point's screen position
    const nextPan = zoomAboutPoint(
      { x: base.panX, y: base.panY },
      focal,
      { width: base.width, height: base.height },
      1,
      2, // zoom in 2×
    );
    const zoomed = { ...base, scale: base.scale * 2, panX: nextPan.x, panY: nextPan.y };
    const after = project(10, 5, zoomed);
    expect(after.x).toBeCloseTo(focal.x, 6);
    expect(after.y).toBeCloseTo(focal.y, 6);
  });

  it("is a no-op when the zoom is unchanged", () => {
    const pan = { x: 12, y: -7 };
    expect(zoomAboutPoint(pan, { x: 40, y: 80 }, { width: 300, height: 600 }, 3, 3)).toEqual(pan);
  });
});

describe("unproject", () => {
  it("round-trips with project across pan/zoom", () => {
    const base = fitView({ minX: -40, maxX: 60, minZ: -30, maxZ: 90 }, 375, 700);
    const view = { ...base, scale: base.scale * 2.5, panX: 37, panY: -18 };
    for (const w of [
      { x: 0, z: 0 },
      { x: -40, z: 90 },
      { x: 60, z: -30 },
      { x: 12.5, z: 7.25 },
    ]) {
      const back = unproject(project(w.x, w.z, view), view);
      expect(back.x).toBeCloseTo(w.x, 6);
      expect(back.z).toBeCloseTo(w.z, 6);
    }
  });

  it("maps the viewport centre to the view centre (zero pan)", () => {
    const view = fitView({ minX: 0, maxX: 100, minZ: -50, maxZ: 50 }, 300, 600);
    const w = unproject({ x: 150, y: 300 }, view);
    expect(w.x).toBeCloseTo(view.centerX, 6);
    expect(w.z).toBeCloseTo(view.centerZ, 6);
  });

  it("returns the view centre when scale is zero", () => {
    const view = { scale: 0, centerX: 5, centerZ: -7, panX: 0, panY: 0, width: 200, height: 200 };
    expect(unproject({ x: 123, y: 45 }, view)).toEqual({ x: 5, z: -7 });
  });
});
