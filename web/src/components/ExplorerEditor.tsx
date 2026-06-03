"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { MemoryRecord } from "@/lib/manifest/types";
import { getResident, getBounds } from "@/lib/splat/registry";
import {
  readMeshTransform,
  toSplatSceneArgs,
  type StoredTransform,
} from "@/lib/transform/apply";
import SplatGizmo, { type GizmoMode } from "@/components/SplatGizmo";
import EditBoxes from "@/components/EditBoxes";

// A memory's current world-space AABB: its cached local bbox placed by the live
// (gizmo-driven) mesh when resident, else by its stored transform. Used to
// raycast clicks against splats.
function worldBox(r: MemoryRecord): THREE.Box3 | null {
  const local = getBounds(r.id);
  if (!local) return null;
  let m: THREE.Matrix4;
  const obj = getResident(r.id);
  if (obj) {
    obj.updateWorldMatrix(true, false);
    m = obj.matrixWorld;
  } else {
    const a = toSplatSceneArgs(r);
    m = new THREE.Matrix4().compose(
      new THREE.Vector3(a.position[0], a.position[1], a.position[2]),
      new THREE.Quaternion(a.rotation[0], a.rotation[1], a.rotation[2], a.rotation[3]),
      new THREE.Vector3(a.scale[0], a.scale[0], a.scale[0]),
    );
  }
  return local.clone().applyMatrix4(m);
}

// In-canvas half of the explorer edit mode: OrbitControls to move around, click
// directly on a splat (raycast against its bounding box) to select it, bbox
// corner markers on every memory, and a gizmo bound to the selected memory's
// resident splat. Selection forces the memory resident in Memories.tsx (via the
// parent's forceResidentId), so we poll the registry until its mesh appears.
export default function ExplorerEditor({
  records,
  selectedId,
  onSelect,
  mode,
  onTransformChange,
}: {
  records: MemoryRecord[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  mode: GizmoMode;
  onTransformChange: (t: StoredTransform | null) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  // `s.controls` is whatever called makeDefault. On entering edit mode it can
  // briefly still be FreeFly's PointerLockControls (no `.target`) before drei's
  // OrbitControls registers, so treat `target` as possibly-absent and re-run
  // these effects once the real OrbitControls (which has it) takes over.
  const controls = useThree((s) => s.controls) as
    | { target?: THREE.Vector3; update?: () => void }
    | null;
  const [mesh, setMesh] = useState<THREE.Object3D | null>(null);

  const recordsRef = useRef(records);
  recordsRef.current = records;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Click directly on a splat to select it: raycast the pointer against each
  // memory's world bbox and pick the nearest hit. Ignore pointer-ups that moved
  // far from the press (those were OrbitControls drags, not clicks).
  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const point = new THREE.Vector3();
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const r of recordsRef.current) {
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
      onSelectRef.current(bestId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl]);

  // Center the orbit on a point ahead of the camera when edit mode opens, so the
  // first drag doesn't swing wildly around the world origin.
  useEffect(() => {
    if (!controls?.target) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    controls.target.set(
      camera.position.x + dir.x * 20,
      camera.position.y + dir.y * 20,
      camera.position.z + dir.z * 20,
    );
    controls.update?.();
  }, [controls, camera]);

  // Selection changed: drop the old mesh and recenter the orbit on the new one.
  useEffect(() => {
    setMesh(null);
    onTransformChange(null);
    if (!controls?.target || !selectedId) return;
    const rec = recordsRef.current.find((r) => r.id === selectedId);
    if (!rec) return;
    const p = rec.transform.position;
    controls.target.set(p[0], p[1], p[2]);
    controls.update?.();
  }, [selectedId, controls, onTransformChange]);

  // Poll the registry until the selected memory's full splat is resident.
  useFrame(() => {
    if (!selectedId) {
      if (mesh) setMesh(null);
      return;
    }
    if (mesh) return;
    const found = getResident(selectedId);
    if (found) {
      setMesh(found);
      onTransformChange(readMeshTransform(found));
    }
  });

  return (
    <>
      <OrbitControls makeDefault />
      <EditBoxes records={records} selectedId={selectedId} />
      {mesh && (
        <SplatGizmo
          object={mesh}
          mode={mode}
          onObjectChange={() => onTransformChange(readMeshTransform(mesh))}
        />
      )}
    </>
  );
}
