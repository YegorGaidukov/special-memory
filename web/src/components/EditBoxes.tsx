"use client";

import { Segments, Segment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { MemoryRecord } from "@/lib/manifest/types";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import { getBounds, getResident } from "@/lib/splat/registry";

// Fraction of each edge that a corner bracket extends along that edge.
const BRACKET_FRAC = 0.2;

type Seg = [THREE.Vector3Tuple, THREE.Vector3Tuple];

// 8 corner brackets: at each corner, three short segments running along the
// three edges that meet there.
function bracketSegments(box: THREE.Box3): Seg[] {
  const { min, max } = box;
  const sx = (max.x - min.x) * BRACKET_FRAC;
  const sy = (max.y - min.y) * BRACKET_FRAC;
  const sz = (max.z - min.z) * BRACKET_FRAC;
  const segs: Seg[] = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) {
        const dx = x === min.x ? sx : -sx;
        const dy = y === min.y ? sy : -sy;
        const dz = z === min.z ? sz : -sz;
        segs.push([[x, y, z], [x + dx, y, z]]);
        segs.push([[x, y, z], [x, y + dy, z]]);
        segs.push([[x, y, z], [x, y, z + dz]]);
      }
  return segs;
}

// Corner brackets for one memory's bounding box. The group carries the memory's
// placement, so the brackets inherit its rotation/scale. The selected memory
// mirrors its live (gizmo-driven) mesh each frame so the box tracks edits before
// they're saved. Uses drei <Segments> (fat lines via LineMaterial), which are
// shader-anti-aliased — the canvas runs antialias:false for splats, so plain GL
// lines would be jagged.
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
  const segs = useMemo(() => bracketSegments(box), [box]);
  const color = selected ? "#e6e9f0" : "#5b6b8c";

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
      <Segments
        lineWidth={selected ? 2 : 1.5}
        transparent
        opacity={selected ? 1 : 0.5}
        depthTest={false}
        toneMapped={false}
      >
        {segs.map(([start, end], i) => (
          <Segment key={i} start={start} end={end} color={color} />
        ))}
      </Segments>
    </group>
  );
}

/** Bounding-box corner brackets for every memory while edit mode is active. */
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
