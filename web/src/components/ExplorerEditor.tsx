"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";
import { pickMemory } from "@/lib/camera/pick";
import { PICK } from "@/config/explorer";
import { getResident } from "@/lib/splat/registry";
import { readMeshTransform, type StoredTransform } from "@/lib/transform/apply";
import SplatGizmo, { type GizmoMode } from "@/components/SplatGizmo";

// In-canvas half of the explorer edit mode: OrbitControls to move around, click
// (not drag) to select the looked-at memory, and a gizmo bound to that memory's
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

  // Click selects the memory the camera is aimed at. Ignore pointer-ups that
  // moved far from the press (those were OrbitControls drags, not clicks).
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
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const hit = pickMemory(recordsRef.current, origin, [dir.x, dir.y, dir.z], {
        maxAngleRad: PICK.maxAngleRad,
        maxDist: PICK.maxDist,
      });
      onSelectRef.current(hit ? hit.id : null);
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
