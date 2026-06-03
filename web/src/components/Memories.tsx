"use client";

import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import * as THREE from "three";
import {
  MEMORIES_BASE_URL,
  LOD,
  PREVIEW,
  RESIDENCY_TICK_MS,
} from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import { decideLod } from "@/lib/lod/decide";
import { previewUrlFor } from "@/lib/lod/previewUrl";
import { loadPreviewPoints } from "@/lib/splat/loadPreviewPoints";
import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";

// Places every memory in the void and manages its level of detail. Each memory
// shows a cheap decimated point cloud (its `.preview.ply` "ghost") until the
// camera flies within LOD.loadRadius, when it resolves into a full Spark
// SplatMesh, and disposes back to the point cloud past LOD.disposeRadius. That
// keeps only the nearby splats resident, so the scene scales to hundreds.
//
// A single SparkRenderer performs the global splat sort across all resident
// SplatMesh objects. Spark's per-mesh `initialized`/`dispose()` lifecycle has no
// add/remove race (the reason auto-LOD was deferred under the old library), so
// `decideLod()` can drive residency directly, holding each mesh by reference.
export default function Memories({ records }: { records: MemoryRecord[] }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const sparkRef = useRef<SparkRenderer | null>(null);
  const previews = useRef<Map<string, THREE.Points>>(new Map());
  const splats = useRef<Map<string, SplatMesh>>(new Map());
  const sinceTick = useRef(0);
  // In-progress point-cloud -> splat cross-dissolves, advanced every frame.
  const fades = useRef<Map<string, { mesh: SplatMesh; points?: THREE.Points; t: number }>>(
    new Map(),
  );

  // Build the SparkRenderer + load a point-cloud preview per memory.
  useEffect(() => {
    if (records.length === 0) return;

    const spark = new SparkRenderer({ renderer: gl });
    scene.add(spark);
    sparkRef.current = spark;

    const ac = new AbortController();
    for (const r of records) {
      const { position, rotation, scale } = toSplatSceneArgs(r);
      const url = resolveAssetUrl(MEMORIES_BASE_URL, previewUrlFor(r.splat_url));
      loadPreviewPoints(url, PREVIEW.pointSize, ac.signal)
        .then((pts) => {
          // Place the ghost exactly where the full splat will sit.
          pts.position.set(position[0], position[1], position[2]);
          pts.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
          pts.scale.setScalar(scale[0]); // SplatMesh scale is uniform
          // If the full splat already loaded while we were fetching, stay hidden.
          if (splats.current.has(r.id)) pts.visible = false;
          previews.current.set(r.id, pts);
          scene.add(pts);
        })
        .catch((err) => {
          if (!ac.signal.aborted)
            console.error("[explorer] preview load failed", r.id, err);
        });
    }

    const loadedPreviews = previews.current;
    const loadedSplats = splats.current;
    const activeFades = fades.current;
    return () => {
      ac.abort();
      activeFades.clear();
      for (const pts of loadedPreviews.values()) {
        scene.remove(pts);
        pts.geometry.dispose();
        (pts.material as THREE.Material).dispose();
      }
      loadedPreviews.clear();
      for (const mesh of loadedSplats.values()) {
        scene.remove(mesh);
        mesh.dispose();
      }
      loadedSplats.clear();
      scene.remove(spark);
      spark.dispose();
      sparkRef.current = null;
    };
  }, [gl, scene, records]);

  useFrame((_, delta) => {
    if (records.length === 0) return;

    // Every frame: advance any point-cloud -> splat cross-dissolves.
    if (fades.current.size > 0) {
      for (const [id, f] of fades.current) {
        f.t = Math.min(1, f.t + (delta * 1000) / PREVIEW.fadeMs);
        const k = f.t * f.t * (3 - 2 * f.t); // smoothstep ease
        f.mesh.opacity = k;
        if (f.points) (f.points.material as THREE.PointsMaterial).opacity = 1 - k;
        if (f.t >= 1) {
          f.mesh.opacity = 1;
          if (f.points) {
            f.points.visible = false;
            (f.points.material as THREE.PointsMaterial).opacity = 1; // reset for reuse
          }
          fades.current.delete(id);
        }
      }
    }

    // Throttled residency tick: load nearby memories as splats, dispose far ones.
    sinceTick.current += delta * 1000;
    if (sinceTick.current < RESIDENCY_TICK_MS) return;
    sinceTick.current = 0;

    const camPos: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    const { toLoad, toUnload } = decideLod(
      records,
      camPos,
      new Set(splats.current.keys()),
      LOD,
    );

    for (const id of toLoad) {
      const r = records.find((x) => x.id === id);
      if (!r || splats.current.has(id)) continue;

      const { position, rotation, scale } = toSplatSceneArgs(r);
      const mesh = new SplatMesh({
        url: resolveAssetUrl(MEMORIES_BASE_URL, r.splat_url),
      });
      mesh.position.set(position[0], position[1], position[2]);
      mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      mesh.scale.setScalar(scale[0]); // SplatMesh scale is uniform
      mesh.opacity = 0; // start invisible; the cross-dissolve fades it in
      splats.current.set(id, mesh);
      scene.add(mesh);

      mesh.initialized
        .then(() => {
          // Cross-dissolve the point cloud into the splat — but only if this mesh
          // is still the resident one (it may have been disposed mid-load).
          if (splats.current.get(id) !== mesh) return;
          fades.current.set(id, { mesh, points: previews.current.get(id), t: 0 });
        })
        .catch((err) => {
          if (splats.current.get(id) !== mesh) return; // disposed mid-load
          console.error("[explorer] splat load failed", id, err);
          splats.current.delete(id);
          scene.remove(mesh);
          mesh.dispose();
        });
    }

    for (const id of toUnload) {
      const mesh = splats.current.get(id);
      if (!mesh) continue;
      fades.current.delete(id); // cancel an in-flight cross-dissolve
      splats.current.delete(id);
      scene.remove(mesh);
      mesh.dispose();
      const ghost = previews.current.get(id);
      if (ghost) {
        // Fall back to the point cloud at full opacity.
        (ghost.material as THREE.PointsMaterial).opacity = 1;
        ghost.visible = true;
      }
    }
  });

  return null;
}
