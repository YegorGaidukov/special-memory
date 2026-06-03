import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CityConfig,
  ExplorerManifest,
  MemoryRecord,
} from "@/lib/manifest/types";
import type { ContribStore } from "./types";
import { parseManifest } from "@/lib/manifest/parse";
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

/**
 * Merge S3's published output with externally-authored manifest entries. Entries
 * whose id is NOT managed by the S3 store (hand-curated seed memories) are
 * preserved; the store's approved records are appended. Any stale entry for a
 * store-managed id is dropped/replaced. This lets curated seed memories and S3
 * contributions coexist in one published manifest instead of approve wiping the
 * seed.
 */
export function mergeManifest(
  existingMemories: MemoryRecord[],
  store: ContribStore,
  city: CityConfig,
): ExplorerManifest {
  const storeIds = new Set(store.records.map((r) => r.id));
  const external = existingMemories.filter((m) => !storeIds.has(m.id));
  const approved = toExplorerManifest(store, city).memories;
  return { city, memories: [...external, ...approved] };
}

/** fs seam: merge with the on-disk manifest and write public/memories/manifest.json. */
export async function publishManifest(
  store: ContribStore,
  city: CityConfig,
): Promise<void> {
  const path = join(PUBLIC_MEMORIES_DIR, "manifest.json");
  let existing: MemoryRecord[] = [];
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    existing = parseManifest(raw).memories;
  } catch {
    existing = []; // missing or unreadable manifest → nothing external to preserve
  }
  const manifest = mergeManifest(existing, store, city);
  await writeFile(path, JSON.stringify(manifest, null, 2));
}
