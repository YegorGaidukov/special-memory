"use client";

import { Html } from "@react-three/drei";
import type { ContribRecord } from "@/server/types";
import styles from "./PendingSpheres.module.css";

// Flat HTML outline markers (not 3D meshes) for memories whose splat is still
// being reconstructed: a pulsing ring drawn at each in-flight memory's projected
// screen position. drei's <Html> portals the ring over the canvas at the 3D
// point and hides it when the point is behind the camera. Replaced by the real
// splat once the record is published and leaves the pending set. No geometry, so
// no visible polygons — just an outline.
export default function PendingSpheres({ records }: { records: ContribRecord[] }) {
  return (
    <>
      {records.map((r) => {
        const p = r.transform.position;
        return (
          <Html
            key={r.id}
            position={[p[0], p[1], p[2]]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div className={styles.ring} />
          </Html>
        );
      })}
    </>
  );
}
