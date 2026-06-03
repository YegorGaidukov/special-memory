"use client";

import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { MemoryRecord } from "@/lib/manifest/types";
import { getResident } from "@/lib/splat/registry";
import { readMeshTransform, type StoredTransform } from "@/lib/transform/apply";
import { worldCorners, memoryAtPointer } from "@/lib/camera/pickAtPointer";
import Gizmo, { type GizmoMode } from "@/components/Gizmo";
import EditBoxes from "@/components/EditBoxes";

// Click radius (px) around a projected bbox corner that counts as selecting it.
const CORNER_PX = 26;

// In-canvas half of the explorer edit mode: shared Navigation provides the camera
// controls; this adds click-to-select (raycast against bounding boxes), bbox
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

      // 1) Precise: select the memory whose nearest projected bbox corner is
      // within CORNER_PX of the click. Wins over the body raycast below, so you
      // can pick a specific memory by its brackets even where boxes overlap.
      let cornerId: string | null = null;
      let cornerBest = CORNER_PX;
      for (const r of recordsRef.current) {
        const corners = worldCorners(r);
        if (!corners) continue;
        for (const c of corners) {
          const n = c.clone().project(camera);
          if (n.z < -1 || n.z > 1) continue; // behind camera / out of depth range
          const sx = rect.left + (n.x * 0.5 + 0.5) * rect.width;
          const sy = rect.top + (-n.y * 0.5 + 0.5) * rect.height;
          const dd = Math.hypot(e.clientX - sx, e.clientY - sy);
          if (dd < cornerBest) {
            cornerBest = dd;
            cornerId = r.id;
          }
        }
      }
      if (cornerId) {
        onSelectRef.current(cornerId);
        return;
      }

      // 2) Fallback: raycast the pointer against each memory's world bbox and
      // pick the nearest hit (clicking the body, not near a corner).
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      onSelectRef.current(memoryAtPointer(recordsRef.current, ndc, camera));
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl]);

  // Selection changed: drop the old mesh and clear the readout. The camera is
  // left untouched — selecting a memory only rebinds the gizmo, it never moves
  // or reorients the view (recentering the orbit here swung the camera on every
  // pick). Navigation owns the camera controls.
  useEffect(() => {
    setMesh(null);
    onTransformChange(null);
  }, [selectedId, onTransformChange]);

  // Poll the registry until the selected memory's full splat is resident, and
  // keep bound to the *current* resident mesh: if the one we hold was disposed
  // and replaced (LOD recycle), rebind so the gizmo never drives a dead object
  // and `readMeshTransform` on save reads the live mesh.
  useFrame(() => {
    if (!selectedId) {
      if (mesh) setMesh(null);
      return;
    }
    const found = getResident(selectedId);
    if (mesh && mesh === found) return;
    if (found) {
      setMesh(found);
      onTransformChange(readMeshTransform(found));
    } else if (mesh) {
      setMesh(null);
    }
  });

  return (
    <>
      <EditBoxes records={records} selectedId={selectedId} />
      {mesh && (
        <Gizmo
          object={mesh}
          mode={mode}
          onObjectChange={() => onTransformChange(readMeshTransform(mesh))}
        />
      )}
    </>
  );
}
