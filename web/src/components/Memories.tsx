"use client";

import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
import { recordsSignature } from "@/lib/transform/overlay";
import { decideLod } from "@/lib/lod/decide";
import { previewUrlFor } from "@/lib/lod/previewUrl";
import { loadPreviewPoints } from "@/lib/splat/loadPreviewPoints";
import {
  setResident,
  clearResident,
  setBounds,
  clearBounds,
} from "@/lib/splat/registry";
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
export default function Memories({
  records,
  forceResidentId = null,
  prefetchId = null,
  onPrefetchPromoted,
}: {
  records: MemoryRecord[];
  // Keep this memory's full splat resident regardless of distance (the explorer
  // edit mode pins the selected memory so its gizmo can attach to a loaded mesh).
  forceResidentId?: string | null;
  // The fly-to target: start downloading its full splat now (while the flight is
  // still in progress) but keep it hidden until the camera actually enters
  // LOD.loadRadius, so on arrival it reveals with no download wait. Cleared by the
  // parent once we promote it (onPrefetchPromoted) or the flight is cancelled.
  prefetchId?: string | null;
  onPrefetchPromoted?: (id: string) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  // Read inside useFrame without re-binding the loop each render.
  const forceResidentIdRef = useRef(forceResidentId);
  forceResidentIdRef.current = forceResidentId;
  const onPrefetchPromotedRef = useRef(onPrefetchPromoted);
  onPrefetchPromotedRef.current = onPrefetchPromoted;

  // Latest records, read inside useFrame / async callbacks so transform edits are
  // picked up without tearing the SparkRenderer down. The heavy setup effect
  // keys on `sig` (id + splat_url set) — a placement edit changes `records`
  // identity but not `sig`, so it re-places splats in place (the effect below)
  // rather than reloading every splat.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const sig = useMemo(() => recordsSignature(records), [records]);

  const sparkRef = useRef<SparkRenderer | null>(null);
  const previews = useRef<Map<string, THREE.Points>>(new Map());
  const splats = useRef<Map<string, SplatMesh>>(new Map());
  // Prefetched splats that have been loaded (or are loading) but not yet revealed:
  // their download was kicked off at travel start and they sit hidden at opacity 0
  // until the camera enters range. Excluded from the decideLod "resident" set so
  // decideLod re-picks them into `toLoad` on arrival (which starts their fade), and
  // never unloads them while far. Cleared on promotion, cancel, or teardown.
  const prefetchedHidden = useRef<Set<string>>(new Set());
  const sinceTick = useRef(0);
  // In-progress cross-dissolves, advanced every frame. `dir` is +1 fading the
  // splat in (ghost out) or -1 fading it out (ghost back in); a completed
  // out-fade disposes the splat. `t` is the splat's presence, 0 (ghost) -> 1.
  const fades = useRef<
    Map<string, { mesh: SplatMesh; points?: THREE.Points; t: number; dir: 1 | -1 }>
  >(new Map());

  // Create the full SplatMesh for a record and start its `.sog` download. Shared by
  // the residency tick (fadeOnInit=true → cross-dissolve in as soon as it loads) and
  // the prefetch effect (fadeOnInit=false → load hidden; the tick starts the fade on
  // arrival). Kept in a ref so both callers use one implementation; it only closes
  // over stable values (scene + the maps above).
  const startSplatLoad = useRef<(r: MemoryRecord, fadeOnInit: boolean) => void>(() => {});
  startSplatLoad.current = (r, fadeOnInit) => {
    const id = r.id;
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
        // Resident and loaded: expose it so the edit gizmo can attach.
        setResident(id, mesh);
        // A prefetched mesh loads hidden — the residency tick starts its fade when
        // the camera arrives (so it doesn't pop in mid-flight from a distance).
        if (fadeOnInit)
          fades.current.set(id, { mesh, points: previews.current.get(id), t: 0, dir: 1 });
      })
      .catch((err) => {
        if (splats.current.get(id) !== mesh) return; // disposed mid-load
        console.error("[explorer] splat load failed", id, err);
        clearResident(id);
        splats.current.delete(id);
        prefetchedHidden.current.delete(id);
        scene.remove(mesh);
        mesh.dispose();
      });
  };

  // Build the SparkRenderer + load a point-cloud preview per memory.
  useEffect(() => {
    if (records.length === 0) return;

    const spark = new SparkRenderer({ renderer: gl });
    scene.add(spark);
    sparkRef.current = spark;

    const ac = new AbortController();
    for (const r of records) {
      const url = resolveAssetUrl(MEMORIES_BASE_URL, previewUrlFor(r.splat_url));
      loadPreviewPoints(url, PREVIEW.pointSize, ac.signal)
        .then((pts) => {
          // Place the ghost exactly where the full splat will sit — reading the
          // latest record so a preview that finishes loading after an edit lands
          // at the edited placement, not the one captured when setup ran.
          const { position, rotation, scale } = toSplatSceneArgs(
            recordsRef.current.find((x) => x.id === r.id) ?? r,
          );
          pts.position.set(position[0], position[1], position[2]);
          pts.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
          pts.scale.setScalar(scale[0]); // SplatMesh scale is uniform
          // If the full splat already loaded while we were fetching, stay hidden.
          if (splats.current.has(r.id)) pts.visible = false;
          previews.current.set(r.id, pts);
          // Cache the splat's LOCAL bbox (geometry space, before placement) for
          // the edit mode's corner markers + click picking.
          pts.geometry.computeBoundingBox();
          if (pts.geometry.boundingBox) setBounds(r.id, pts.geometry.boundingBox.clone());
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
      for (const [id, pts] of loadedPreviews) {
        clearBounds(id);
        scene.remove(pts);
        pts.geometry.dispose();
        (pts.material as THREE.Material).dispose();
      }
      loadedPreviews.clear();
      for (const [id, mesh] of loadedSplats) {
        clearResident(id);
        scene.remove(mesh);
        mesh.dispose();
      }
      loadedSplats.clear();
      prefetchedHidden.current.clear();
      scene.remove(spark);
      spark.dispose();
      sparkRef.current = null;
    };
  }, [gl, scene, sig]);

  // Prefetch the fly-to target's full splat the moment travel begins, so its `.sog`
  // downloads DURING the flight instead of only after the camera lands. It loads
  // hidden (opacity 0, no fade) and is excluded from the residency "resident" set,
  // so the residency tick reveals it (starts its cross-dissolve) once the camera
  // enters LOD.loadRadius — with the download already done. Fires immediately (no
  // 200 ms tick wait). If the flight is cancelled/replaced before the camera lands
  // (the id is still hidden on cleanup), the wasted mesh is disposed.
  useEffect(() => {
    if (!prefetchId) return;
    const r = recordsRef.current.find((x) => x.id === prefetchId);
    // Skip if already loaded/loading via normal LOD (near the target already) — we
    // must not adopt or dispose a mesh the residency loop owns.
    if (!r || splats.current.has(prefetchId)) return;
    prefetchedHidden.current.add(prefetchId);
    startSplatLoad.current(r, false);
    return () => {
      if (!prefetchedHidden.current.has(prefetchId)) return; // already revealed → LOD owns it
      prefetchedHidden.current.delete(prefetchId);
      const mesh = splats.current.get(prefetchId);
      if (!mesh) return;
      clearResident(prefetchId);
      splats.current.delete(prefetchId);
      scene.remove(mesh);
      mesh.dispose();
    };
  }, [prefetchId, scene]);

  // Re-place ghosts + resident splats in place when a memory's stored transform
  // changes (a curator edit overlaid onto `records`), without rebuilding the
  // SparkRenderer. The actively-pinned memory (forceResidentId) is skipped — the
  // gizmo owns its live mesh, and its overlay value was mirrored from that mesh.
  // Re-runs when the pin moves too, so the just-released memory's ghost (which
  // was skipped while pinned) is synced to its edited placement on deselect/exit
  // — otherwise it snaps back to the stale ghost position when LOD recycles it.
  useEffect(() => {
    for (const r of records) {
      if (r.id === forceResidentId) continue;
      const { position, rotation, scale } = toSplatSceneArgs(r);
      const ghost = previews.current.get(r.id);
      if (ghost) {
        ghost.position.set(position[0], position[1], position[2]);
        ghost.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
        ghost.scale.setScalar(scale[0]);
      }
      const splat = splats.current.get(r.id);
      if (splat) {
        splat.position.set(position[0], position[1], position[2]);
        splat.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
        splat.scale.setScalar(scale[0]);
      }
    }
  }, [records, forceResidentId]);

  useFrame((_, delta) => {
    const records = recordsRef.current;
    if (records.length === 0) return;

    // Every frame: advance any point-cloud -> splat cross-dissolves.
    if (fades.current.size > 0) {
      const step = (delta * 1000) / PREVIEW.fadeMs;
      for (const [id, f] of fades.current) {
        f.t = Math.max(0, Math.min(1, f.t + f.dir * step));
        const k = f.t * f.t * (3 - 2 * f.t); // smoothstep ease
        f.mesh.opacity = k;
        if (f.points) (f.points.material as THREE.PointsMaterial).opacity = 1 - k;
        if (f.dir === 1 && f.t >= 1) {
          // Faded in: splat fully shown, ghost hidden and reset for reuse.
          f.mesh.opacity = 1;
          if (f.points) {
            f.points.visible = false;
            (f.points.material as THREE.PointsMaterial).opacity = 1;
          }
          fades.current.delete(id);
        } else if (f.dir === -1 && f.t <= 0) {
          // Faded out: ghost fully back at full opacity, now dispose the splat.
          if (f.points) {
            f.points.visible = true;
            (f.points.material as THREE.PointsMaterial).opacity = 1;
          }
          clearResident(id);
          splats.current.delete(id);
          scene.remove(f.mesh);
          f.mesh.dispose();
          fades.current.delete(id);
        }
      }
    }

    // Throttled residency tick: load nearby memories as splats, dispose far ones.
    sinceTick.current += delta * 1000;
    if (sinceTick.current < RESIDENCY_TICK_MS) return;
    sinceTick.current = 0;

    const camPos: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    // A splat mid out-fade counts as "not resident", so a camera that turns back
    // reverses its fade (reusing the mesh, below) instead of disposing+reloading.
    // Prefetched-hidden splats also count as "not resident" so decideLod re-picks
    // them into `toLoad` the moment the camera enters range (revealing them) yet
    // never unloads them while far.
    const resident = new Set(
      [...splats.current.keys()].filter(
        (id) => fades.current.get(id)?.dir !== -1 && !prefetchedHidden.current.has(id),
      ),
    );
    const decided = decideLod(records, camPos, resident, LOD);
    let toLoad = decided.toLoad;
    let toUnload = decided.toUnload;

    // Pin the explorer-selected memory: never unload it, and force it to load
    // even when the camera is far, so the edit gizmo always has a real mesh.
    const force = forceResidentIdRef.current;
    if (force) {
      toUnload = toUnload.filter((id) => id !== force);
      if (!resident.has(force) && !toLoad.includes(force)) toLoad = [...toLoad, force];
    }

    for (const id of toLoad) {
      const r = records.find((x) => x.id === id);
      if (!r) continue;

      // Already have a mesh — reuse it. Either it was fading out (reverse it back
      // in) or it was prefetched-hidden and the camera has now arrived (reveal it).
      const existing = splats.current.get(id);
      if (existing) {
        const f = fades.current.get(id);
        fades.current.set(id, {
          mesh: existing,
          points: previews.current.get(id),
          t: f ? f.t : 0,
          dir: 1,
        });
        // Promotion: a prefetched-hidden splat just entered range — its download is
        // already done, so this reveal has no network wait. Release the parent's pin.
        if (prefetchedHidden.current.delete(id)) onPrefetchPromotedRef.current?.(id);
        continue;
      }

      startSplatLoad.current(r, true);
    }

    for (const id of toUnload) {
      const mesh = splats.current.get(id);
      if (!mesh) continue;
      const f = fades.current.get(id);
      // Never faded in (still loading) — nothing on screen to dissolve, so
      // dispose now; its `initialized` handler sees it's gone and bails.
      if (!f && mesh.opacity === 0) {
        clearResident(id);
        splats.current.delete(id);
        scene.remove(mesh);
        mesh.dispose();
        continue;
      }
      // Otherwise cross-dissolve back into the ghost (reverse of the load fade);
      // the frame loop disposes the mesh once the out-fade reaches t <= 0.
      const ghost = previews.current.get(id);
      if (ghost) ghost.visible = true;
      fades.current.set(id, { mesh, points: ghost, t: f ? f.t : 1, dir: -1 });
    }
  });

  return null;
}
