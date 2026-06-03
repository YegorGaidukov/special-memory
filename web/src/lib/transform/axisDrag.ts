/**
 * Pure math for the transform gizmo's translate handle. Dragging along a world
 * axis is done by intersecting the pointer ray with a plane that CONTAINS the
 * axis and faces the camera, then reading how far along the axis that hit lies.
 *
 * Used delta-style by the gizmo (`s - s0`, both from {@link axisDragParam}): a
 * grab whose pointer hasn't moved gives `s === s0`, so the splat doesn't budge.
 * This replaces a closest-point-on-skew-line param, which was ill-conditioned
 * (and had a hard `return 0` discontinuity) when the axis tilted toward the
 * camera — that discontinuity made the splat jump the instant a handle was
 * grabbed. The drag plane is always well-conditioned except when the axis points
 * almost straight at the camera, which {@link axisDragPlaneNormal} reports as
 * `null` so the caller can skip the gesture rather than snap.
 *
 * Three-free (plain `[x,y,z]` triples) so it's unit-tested without a GPU/WebGL,
 * matching the repo's "test the pure logic, mock the renderer" convention.
 */
export type V3 = readonly [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Normal of the drag plane for translating along `axis`: the view direction with
 * its axis-parallel component removed, so the plane contains `axis` and is as
 * camera-facing as possible. `null` when `axis` is ~parallel to `viewDir` (no
 * stable plane — the axis points at/away from the camera).
 */
export function axisDragPlaneNormal(axis: V3, viewDir: V3): V3 | null {
  const k = dot(viewDir, axis);
  const n: V3 = [viewDir[0] - k * axis[0], viewDir[1] - k * axis[1], viewDir[2] - k * axis[2]];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-4) return null;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * Signed distance along `axis` (a unit vector through `origin`) of the point
 * where the ray `rayOrigin + t·rayDir` meets the plane through `origin` with
 * normal `planeNormal`. `null` if the ray is parallel to the plane.
 */
export function axisDragParam(
  rayOrigin: V3,
  rayDir: V3,
  origin: V3,
  axis: V3,
  planeNormal: V3,
): number | null {
  const denom = dot(planeNormal, rayDir);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot(planeNormal, sub(origin, rayOrigin)) / denom;
  const hit: V3 = [rayOrigin[0] + t * rayDir[0], rayOrigin[1] + t * rayDir[1], rayOrigin[2] + t * rayDir[2]];
  return dot(axis, sub(hit, origin));
}
