import type { Box3, Object3D } from "three";

// A tiny module-scope registry of currently-resident full SplatMesh objects,
// keyed by memory id. Memories.tsx registers a mesh once it has loaded and clears
// it on dispose; the explorer's edit mode reads it to attach a transform gizmo
// without threading refs through the component tree. There is a single explorer
// instance, so a module-level map is sufficient (and cleared on unmount).
const resident = new Map<string, Object3D>();

export function setResident(id: string, obj: Object3D): void {
  resident.set(id, obj);
}

export function clearResident(id: string): void {
  resident.delete(id);
}

export function getResident(id: string): Object3D | null {
  return resident.get(id) ?? null;
}

// Per-memory LOCAL-space bounding box (before the memory's placement transform),
// derived once from its preview point cloud. The edit mode reads these to draw
// bbox corner markers and to raycast clicks against each memory's world box.
const bounds = new Map<string, Box3>();

export function setBounds(id: string, box: Box3): void {
  bounds.set(id, box);
}

export function getBounds(id: string): Box3 | null {
  return bounds.get(id) ?? null;
}

export function clearBounds(id: string): void {
  bounds.delete(id);
}
