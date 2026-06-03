"use client";

import { Line, Segments, Segment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { MemoryRecord } from "@/lib/manifest/types";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import { getBounds, getResident } from "@/lib/splat/registry";

// Fixed corner-bracket arm length (local units), independent of box size, but
// clamped so it never exceeds ~half an edge on a small box.
const BRACKET_LEN = 10.0;

type Seg = [THREE.Vector3Tuple, THREE.Vector3Tuple];

// 8 corner brackets: at each corner, three short segments running along the
// three edges that meet there.
function bracketSegments(box: THREE.Box3): Seg[] {
  const { min, max } = box;
  const sx = Math.min(BRACKET_LEN, (max.x - min.x) * 0.45);
  const sy = Math.min(BRACKET_LEN, (max.y - min.y) * 0.45);
  const sz = Math.min(BRACKET_LEN, (max.z - min.z) * 0.45);
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

// All 12 box edges as a flat list of endpoint pairs (for a <Line segments>).
function boxEdges(box: THREE.Box3): THREE.Vector3Tuple[] {
  const { min, max } = box;
  const c: THREE.Vector3Tuple[] = [];
  for (const z of [min.z, max.z])
    for (const y of [min.y, max.y])
      for (const x of [min.x, max.x]) c.push([x, y, z]); // index bits: x|y<<1|z<<2
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], // x
    [0, 2], [1, 3], [4, 6], [5, 7], // y
    [0, 4], [1, 5], [2, 6], [3, 7], // z
  ];
  const pts: THREE.Vector3Tuple[] = [];
  for (const [i, j] of edges) {
    pts.push(c[i], c[j]);
  }
  return pts;
}

// Mirror a memory's live (gizmo-driven) mesh each frame, so an edited box tracks
// the splat before the edit is saved.
function useLiveMirror(id: string, groupRef: React.RefObject<THREE.Group | null>) {
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const obj = getResident(id);
    if (obj) {
      g.position.copy(obj.position);
      g.quaternion.copy(obj.quaternion);
      g.scale.copy(obj.scale);
    }
  });
}

// Corner brackets for an UNSELECTED memory (drei <Segments>, shader-AA fat
// lines). The group carries the memory's stored placement.
function CornerBox({
  box,
  position,
  quaternion,
  scale,
}: {
  box: THREE.Box3;
  position: THREE.Vector3Tuple;
  quaternion: [number, number, number, number];
  scale: number;
}) {
  const segs = useMemo(() => bracketSegments(box), [box]);
  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      <Segments lineWidth={1.5} transparent opacity={0.5} depthTest={false} toneMapped={false}>
        {segs.map(([start, end], i) => (
          <Segment key={i} start={start} end={end} color="#ffffff" />
        ))}
      </Segments>
    </group>
  );
}

// The SELECTED (editing) memory: full bounding-box edges drawn as a dashed line,
// mirroring the live mesh so it tracks gizmo / numeric edits.
function DashedBox({
  id,
  box,
  position,
  quaternion,
  scale,
}: {
  id: string;
  box: THREE.Box3;
  position: THREE.Vector3Tuple;
  quaternion: [number, number, number, number];
  scale: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const points = useMemo(() => boxEdges(box), [box]);
  // Dash sizing in the box's local units → consistent density across box sizes.
  const dash = useMemo(() => {
    const s = new THREE.Vector3();
    box.getSize(s);
    return Math.max(0.05, ((s.x + s.y + s.z) / 3) * 0.05);
  }, [box]);
  useLiveMirror(id, groupRef);

  return (
    <group ref={groupRef} position={position} quaternion={quaternion} scale={scale}>
      <Line
        points={points}
        segments
        color="#1900ff"
        lineWidth={1.75}
        dashed
        dashSize={dash}
        gapSize={dash}
        transparent
        depthTest={false}
        toneMapped={false}
      />
    </group>
  );
}

/** Bbox markers while edit mode is active: dashed edges on the editing memory,
 *  corner brackets on the rest. */
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
        const common = {
          box,
          position: [a.position[0], a.position[1], a.position[2]] as THREE.Vector3Tuple,
          quaternion: a.rotation,
          scale: a.scale[0],
        };
        return r.id === selectedId ? (
          <DashedBox key={r.id} id={r.id} {...common} />
        ) : (
          <CornerBox key={r.id} {...common} />
        );
      })}
    </>
  );
}
