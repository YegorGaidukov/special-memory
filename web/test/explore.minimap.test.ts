import { describe, it, expect } from "vitest";
import { worldBounds, fitView, project } from "@/lib/explore/minimap";

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
