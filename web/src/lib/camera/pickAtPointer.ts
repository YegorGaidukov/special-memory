import * as THREE from "three";
import type { MemoryRecord } from "@/lib/manifest/types";
import { getResident, getBounds } from "@/lib/splat/registry";
import { toSplatSceneArgs } from "@/lib/transform/apply";

// A memory's current placement matrix: the live (gizmo-driven) mesh's world
// matrix when resident, else composed from its stored transform.
export function worldMatrix(r: MemoryRecord): THREE.Matrix4 | null {
  const obj = getResident(r.id);
  if (obj) {
    obj.updateWorldMatrix(true, false);
    return obj.matrixWorld;
  }
  const a = toSplatSceneArgs(r);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(a.position[0], a.position[1], a.position[2]),
    new THREE.Quaternion(a.rotation[0], a.rotation[1], a.rotation[2], a.rotation[3]),
    new THREE.Vector3(a.scale[0], a.scale[0], a.scale[0]),
  );
}

// A memory's current world-space AABB: its cached local bbox placed by the
// current world matrix. Null until the preview (which sets the local bounds) has
// loaded.
export function worldBox(r: MemoryRecord): THREE.Box3 | null {
  const local = getBounds(r.id);
  const m = worldMatrix(r);
  if (!local || !m) return null;
  return local.clone().applyMatrix4(m);
}

// The 8 world-space corners of a memory's bbox (where the bracket markers sit).
export function worldCorners(r: MemoryRecord): THREE.Vector3[] | null {
  const local = getBounds(r.id);
  const m = worldMatrix(r);
  if (!local || !m) return null;
  const { min, max } = local;
  const out: THREE.Vector3[] = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z).applyMatrix4(m));
  return out;
}

/**
 * Raycast a pointer (in normalized device coords) against each memory's world
 * bounding box and return the id of the nearest hit, or null. Shared by edit
 * mode (click to select) and fly mode (double-click to travel) so both pick the
 * memory directly under the cursor with identical behaviour.
 */
export function memoryAtPointer(
  records: MemoryRecord[],
  ndc: THREE.Vector2,
  camera: THREE.Camera,
): string | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const point = new THREE.Vector3();
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const r of records) {
    const box = worldBox(r);
    if (!box) continue;
    if (raycaster.ray.intersectBox(box, point)) {
      const d = raycaster.ray.origin.distanceTo(point);
      if (d < bestDist) {
        bestDist = d;
        bestId = r.id;
      }
    }
  }
  return bestId;
}
