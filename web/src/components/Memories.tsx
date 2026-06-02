"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import { DropInViewer } from "@mkkellogg/gaussian-splats-3d";
import { MEMORIES_BASE_URL, LOD } from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import { decideLod } from "@/lib/lod/decide";
import {
  sceneIndexOf,
  withSceneAdded,
  withSceneRemoved,
} from "@/lib/lod/index_map";
import MemoryBillboard from "@/components/MemoryBillboard";
import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";

/**
 * LOD loader: one DropInViewer holds only the nearby splats. Each frame it asks
 * decideLod what to load/dispose, then enacts ONE viewer mutation at a time
 * (serialized via `busy`) so add/remove never race and scene indices stay in
 * sync (index_map). Billboards show each memory's thumbnail until its splat is
 * loaded, so VRAM stays bounded no matter how many memories exist.
 */
export default function Memories({ records }: { records: MemoryRecord[] }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const viewerRef = useRef<DropInViewer | null>(null);
  const order = useRef<string[]>([]); // memory ids in scene-index order
  const loaded = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const viewer = new DropInViewer({ sharedMemoryForWorkers: true });
    viewerRef.current = viewer;
    scene.add(viewer);
    return () => {
      viewerRef.current = null;
      scene.remove(viewer);
      viewer.dispose().catch(() => {});
      order.current = [];
      loaded.current = new Set();
    };
  }, [scene]);

  useFrame(() => {
    const viewer = viewerRef.current;
    // Only one viewer mutation at a time: our own flag AND the viewer's own
    // in-progress state (it throws synchronously if asked to add/remove while
    // busy). Together they keep scene indices consistent.
    if (!viewer || busy.current || viewer.viewer.isLoadingOrUnloading()) return;

    const camPos: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    const { toLoad, toUnload } = decideLod(records, camPos, loaded.current, LOD);

    // Runs a single viewer op; a synchronous throw (viewer briefly busy) just
    // resets the flag so the next frame retries instead of wedging forever.
    const run = (op: () => Promise<unknown>, onDone: () => void, label: string) => {
      busy.current = true;
      let p: Promise<unknown>;
      try {
        p = Promise.resolve(op());
      } catch {
        busy.current = false;
        return;
      }
      p.then(onDone)
        .catch((err) => {
          const e = err as { aborted?: boolean; name?: string };
          if (!(e?.aborted || e?.name === "AbortError"))
            console.error(`[explorer] ${label} failed`, err);
        })
        .finally(() => {
          busy.current = false;
        });
    };

    // Free VRAM before loading more: enact one unload, else one load.
    if (toUnload.length > 0) {
      const id = toUnload[0];
      const index = sceneIndexOf(order.current, id);
      if (index < 0) {
        loaded.current.delete(id);
        return;
      }
      run(
        () => viewer.removeSplatScene(index),
        () => {
          order.current = withSceneRemoved(order.current, id).order;
          loaded.current.delete(id);
          setLoadedIds(new Set(loaded.current));
        },
        "unload",
      );
      return;
    }

    if (toLoad.length > 0) {
      const id = toLoad[0];
      const rec = records.find((r) => r.id === id);
      if (!rec) return;
      const { position, rotation, scale } = toSplatSceneArgs(rec);
      const url = resolveAssetUrl(MEMORIES_BASE_URL, rec.splat_url);
      run(
        () =>
          viewer.addSplatScene(url, {
            position,
            rotation,
            scale,
            showLoadingUI: false,
            progressiveLoad: true,
          }),
        () => {
          order.current = withSceneAdded(order.current, id);
          loaded.current.add(id);
          setLoadedIds(new Set(loaded.current));
        },
        "load",
      );
    }
  });

  return (
    <Suspense fallback={null}>
      {records.map((r) => (
        <MemoryBillboard key={r.id} record={r} visible={!loadedIds.has(r.id)} />
      ))}
    </Suspense>
  );
}
