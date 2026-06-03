import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CityConfig,
  ExplorerManifest,
  MemoryRecord,
} from "@/lib/manifest/types";
import type { ContribStore } from "./types";
import { PUBLIC_MEMORIES_DIR } from "./paths";

// Curated gate: only approved memories reach the explorer (the spec's "approve
// flag"). Server-only fields are stripped so the published manifest matches the
// explorer's contract exactly.
function toMemoryRecord(r: ContribStore["records"][number]): MemoryRecord {
  // Omit source_image; keep everything the explorer parser expects.
  const { source_image: _omit, ...rest } = r;
  void _omit;
  return rest;
}

/** Pure projection: full store → the explorer's manifest shape. */
export function toExplorerManifest(
  store: ContribStore,
  city: CityConfig,
): ExplorerManifest {
  return {
    city,
    memories: store.records
      .filter((r) => r.status === "approved")
      .map(toMemoryRecord),
  };
}

/** fs seam: write the published manifest to public/memories/manifest.json. */
export async function publishManifest(
  store: ContribStore,
  city: CityConfig,
): Promise<void> {
  const manifest = toExplorerManifest(store, city);
  const path = join(PUBLIC_MEMORIES_DIR, "manifest.json");
  await writeFile(path, JSON.stringify(manifest, null, 2));
}
