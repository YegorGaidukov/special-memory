import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";
import type { LodConfig, LodDecision } from "./types";

/**
 * Decide which memories to load (splat) or unload (back to point cloud) given the
 * camera position. Loading happens within loadRadius, disposal only past
 * disposeRadius — the gap is hysteresis so a memory near the boundary doesn't
 * thrash. New loads are the nearest few, capped by maxConcurrentLoads.
 */
export function decideLod(
  records: MemoryRecord[],
  camPos: Vec3,
  loaded: ReadonlySet<string>,
  cfg: LodConfig,
): LodDecision {
  const toUnload: string[] = [];
  const candidates: { id: string; d: number }[] = [];

  for (const r of records) {
    const p = r.transform.position;
    const d = Math.hypot(p[0] - camPos[0], p[1] - camPos[1], p[2] - camPos[2]);
    if (loaded.has(r.id)) {
      if (d > cfg.disposeRadius) toUnload.push(r.id);
    } else if (d <= cfg.loadRadius) {
      candidates.push({ id: r.id, d });
    }
  }

  candidates.sort((a, b) => a.d - b.d);
  const toLoad = candidates.slice(0, cfg.maxConcurrentLoads).map((c) => c.id);
  return { toLoad, toUnload };
}
