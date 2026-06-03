import type { Quat, Vec3 } from "@/lib/manifest/types";

/** A transform written directly by the 3D gizmo (uniform scalar scale). */
export interface StoredTransformInput {
  position: Vec3;
  quaternion: Quat;
  scale: number;
}

function isFiniteNumberArray(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Validate an untrusted `{position, quaternion, scale}` payload from the gizmo
 * before it is stored. Position is a finite Vec3, quaternion a finite Quat, and
 * scale a finite positive number (a zero/negative scale would collapse or mirror
 * the splat). This is the gate for `PATCH /api/memories/[id]/transform`.
 */
export function isValidTransform(value: unknown): value is StoredTransformInput {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    isFiniteNumberArray(t.position, 3) &&
    isFiniteNumberArray(t.quaternion, 4) &&
    typeof t.scale === "number" &&
    Number.isFinite(t.scale) &&
    t.scale > 0
  );
}
