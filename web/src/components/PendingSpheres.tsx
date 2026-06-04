"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FLY_TO_STANDOFF } from "@/config/explorer";
import type { ContribRecord } from "@/server/types";

// Faint glowing wireframe spheres marking memories whose splat is still being
// reconstructed. One shared geometry + material across all spheres (only the
// per-mesh position differs). Replaced by the real splat once the record is
// published and leaves the pending set. Visual-only; no LOD.
export default function PendingSpheres({ records }: { records: ContribRecord[] }) {
  const geometry = useMemo(
    () => new THREE.SphereGeometry(FLY_TO_STANDOFF * 0.5, 24, 16),
    [],
  );
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#8fb6ff",
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <>
      {records.map((r) => {
        const p = r.transform.position;
        return (
          <mesh
            key={r.id}
            geometry={geometry}
            material={material}
            position={[p[0], p[1], p[2]]}
          />
        );
      })}
    </>
  );
}
