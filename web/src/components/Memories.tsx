"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { DropInViewer } from "@mkkellogg/gaussian-splats-3d";
import { MEMORIES_BASE_URL } from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import type { MemoryRecord } from "@/lib/manifest/types";

// Loads every memory's splat at its stored transform, in one batch, into a
// single DropInViewer.
//
// Auto-LOD (load/dispose-on-approach + photo billboards) is intentionally
// disabled for now: the library's dynamic addSplatScene/removeSplatScene races
// its async splat-tree build (a null `visitLeaves` crash). The decision logic
// lives, tested, in `lib/lod/` for when we revisit a stable approach.
export default function Memories({ records }: { records: MemoryRecord[] }) {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    if (records.length === 0) return;

    const viewer = new DropInViewer({ sharedMemoryForWorkers: true });
    scene.add(viewer);

    const sceneOptions = records.map((r) => {
      const { position, rotation, scale } = toSplatSceneArgs(r);
      return {
        path: resolveAssetUrl(MEMORIES_BASE_URL, r.splat_url),
        position,
        rotation,
        scale,
      };
    });

    const loader = viewer.addSplatScenes(sceneOptions, false);
    Promise.resolve(loader).catch((err) => {
      const e = err as { aborted?: boolean; name?: string };
      if (!(e?.aborted || e?.name === "AbortError"))
        console.error("[explorer] failed to load splats", err);
    });

    return () => {
      (loader as { abort?: () => void }).abort?.();
      scene.remove(viewer);
      viewer.dispose().catch(() => {});
    };
  }, [scene, records]);

  return null;
}
