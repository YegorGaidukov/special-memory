import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CityConfig,
  ExplorerManifest,
  MemoryRecord,
  Transform,
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

interface RawMemory {
  id?: unknown;
  [key: string]: unknown;
}
interface RawManifest {
  memories?: unknown;
  [key: string]: unknown;
}

/**
 * Pure: replace one memory's `transform` in a raw manifest, preserving every
 * other field. Used for hand-authored seed memories that live only in the
 * published manifest (not the S3 store), so the explorer's edit mode can move
 * them. `found` is false when the id isn't present.
 */
export function patchManifestMemoryTransform(
  raw: RawManifest,
  id: string,
  transform: Transform,
): { manifest: RawManifest; found: boolean } {
  const memories = Array.isArray(raw.memories) ? (raw.memories as RawMemory[]) : [];
  let found = false;
  const next = memories.map((m) => {
    if (m && m.id === id) {
      found = true;
      return { ...m, transform };
    }
    return m;
  });
  return { manifest: { ...raw, memories: next }, found };
}

/**
 * fs seam: patch a single memory's transform directly in the published manifest.
 * Returns false (so the caller can 404) when the manifest is missing/unreadable
 * or the id isn't in it.
 */
export async function patchPublishedTransform(
  id: string,
  transform: Transform,
): Promise<boolean> {
  const path = join(PUBLIC_MEMORIES_DIR, "manifest.json");
  let raw: RawManifest;
  try {
    raw = JSON.parse(await readFile(path, "utf8")) as RawManifest;
  } catch {
    return false;
  }
  const { manifest, found } = patchManifestMemoryTransform(raw, id, transform);
  if (!found) return false;
  await writeFile(path, JSON.stringify(manifest, null, 2));
  return true;
}
