"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { MemoryRecord } from "@/lib/manifest/types";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import { getBounds, getResident } from "@/lib/splat/registry";

// The 8 corners of a local-space box.
function corners(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;
  const out: THREE.Vector3[] = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

// Corner markers (+ a faint wireframe) for one memory's bounding box. The group
// carries the memory's placement, so corners inherit its rotation/scale. The
// selected memory mirrors its live (gizmo-driven) mesh each frame so the box
// tracks edits before they're saved.
function CornerBox({
  id,
  box,
  position,
  quaternion,
  scale,
  selected,
}: {
  id: string;
  box: THREE.Box3;
  position: THREE.Vector3Tuple;
  quaternion: [number, number, number, number];
  scale: number;
  selected: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pts = useMemo(() => corners(box), [box]);
  const size = useMemo(() => box.getSize(new THREE.Vector3()), [box]);
  const center = useMemo(() => box.getCenter(new THREE.Vector3()), [box]);
  const r = useMemo(
    () => Math.max(Math.max(size.x, size.y, size.z) * 0.03, 0.05),
    [size],
  );
  const color = selected ? "#9ad0ff" : "#54618a";

  useFrame(() => {
    const g = groupRef.current;
    if (!g || !selected) return;
    const obj = getResident(id);
    if (obj) {
      g.position.copy(obj.position);
      g.quaternion.copy(obj.quaternion);
      g.scale.copy(obj.scale);
    }
  });

  return (
    <group ref={groupRef} position={position} quaternion={quaternion} scale={scale}>
      <mesh position={center}>
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={selected ? 0.25 : 0.12}
          depthTest={false}
        />
      </mesh>
      {pts.map((c, i) => (
        <mesh key={i} position={c}>
          <sphereGeometry args={[r, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={selected ? 1 : 0.7}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Bounding-box corner markers for every memory while edit mode is active. */
export default function EditBoxes({
  records,
  selectedId,
}: {
  records: MemoryRecord[];
  selectedId: string | null;
}) {
  return (
    <>
      {records.map((r) => {
        const box = getBounds(r.id);
        if (!box) return null;
        const a = toSplatSceneArgs(r);
        return (
          <CornerBox
            key={r.id}
            id={r.id}
            box={box}
            position={[a.position[0], a.position[1], a.position[2]]}
            quaternion={a.rotation}
            scale={a.scale[0]}
            selected={r.id === selectedId}
          />
        );
      })}
    </>
  );
}
