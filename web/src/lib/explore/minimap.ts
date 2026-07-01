// Pure top-down minimap projection for the phone Explore field. Memories live in
// world metres (three.js frame: East = +X, North = -Z, ground y = 0); the Explore
// screen plots them as a north-up 2D scatter you can pan. All geometry here is pure
// and unit-tested; the React component only owns touch/pan state + rendering.

export interface WorldPoint {
  /** East (+X) in metres, from `transform.position[0]`. */
  x: number;
  /** South (+Z) in metres, from `transform.position[2]` (North is -Z). */
  z: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * A fitted view: world→screen affine. `scale` is px per metre; the world point
 * (centerX, centerZ) maps to the viewport centre, offset by the user's pan.
 * North-up falls out for free: screen-Y grows with Z (South), so smaller Z
 * (North) sits higher on screen — no axis flip needed.
 */
export interface MinimapView {
  scale: number;
  centerX: number;
  centerZ: number;
  panX: number;
  panY: number;
  width: number;
  height: number;
}

/** Axis-aligned bounds of a point set, or null when empty. */
export function worldBounds(points: readonly WorldPoint[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

export interface FitOptions {
  /** Inset from the viewport edges, in px (keeps labels off the rim). */
  padding?: number;
  /** Smallest world span to fit, in metres — stops a tight cluster (or a single
   *  memory) from zooming to an absurd scale. */
  minSpan?: number;
  /** Upper bound on px-per-metre, same purpose as `minSpan`. */
  maxScale?: number;
}

/**
 * Fit `bounds` into a `width`×`height` viewport, preserving aspect ratio and
 * centring the content. Returns a zero-pan `MinimapView`; the component adds pan
 * (and optional pinch-zoom by scaling `scale`) on top.
 */
export function fitView(
  bounds: Bounds | null,
  width: number,
  height: number,
  opts: FitOptions = {},
): MinimapView {
  const padding = opts.padding ?? 44;
  const minSpan = opts.minSpan ?? 20;
  const maxScale = opts.maxScale ?? 6;
  if (bounds === null) {
    return { scale: 1, centerX: 0, centerZ: 0, panX: 0, panY: 0, width, height };
  }
  const spanX = Math.max(bounds.maxX - bounds.minX, minSpan);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, minSpan);
  const usableW = Math.max(width - 2 * padding, 1);
  const usableH = Math.max(height - 2 * padding, 1);
  const scale = Math.min(usableW / spanX, usableH / spanZ, maxScale);
  return {
    scale,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    panX: 0,
    panY: 0,
    width,
    height,
  };
}

/** Project a world point to screen px under `view` (north-up). */
export function project(x: number, z: number, view: MinimapView): ScreenPoint {
  return {
    x: (x - view.centerX) * view.scale + view.width / 2 + view.panX,
    y: (z - view.centerZ) * view.scale + view.height / 2 + view.panY,
  };
}

/** Clamp a zoom factor to `[min, max]`. */
export function clampZoom(zoom: number, min: number, max: number): number {
  return Math.min(Math.max(zoom, min), max);
}

/**
 * New pan that keeps the world point currently under the `focal` screen point
 * fixed while the zoom multiplier changes from `prevZoom` to `nextZoom`
 * (pinch/wheel "zoom toward the fingers"). Works purely in screen space via the
 * zoom ratio — the fitted base scale cancels out, so callers pass the multiplier,
 * not px-per-metre. `viewport` is the plotted area size in px.
 */
export function zoomAboutPoint(
  pan: ScreenPoint,
  focal: ScreenPoint,
  viewport: { width: number; height: number },
  prevZoom: number,
  nextZoom: number,
): ScreenPoint {
  const r = prevZoom === 0 ? 1 : nextZoom / prevZoom;
  return {
    x: (focal.x - viewport.width / 2) * (1 - r) + pan.x * r,
    y: (focal.y - viewport.height / 2) * (1 - r) + pan.y * r,
  };
}
