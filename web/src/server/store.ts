import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ContribRecord, ContribStore } from "./types";

// The store is a single JSON file under web/data/ (git-ignored). One file is
// enough at this scale (tens–hundreds of memories) per the spec's "SQLite or a
// JSON file". Pure ops below are unit-tested; load/save are the fs seam.
export const STORE_PATH =
  process.env.MEMORIES_STORE_PATH ?? join(process.cwd(), "data", "memories.json");

export function emptyStore(): ContribStore {
  return { records: [] };
}

export function findById(store: ContribStore, id: string): ContribRecord | undefined {
  return store.records.find((r) => r.id === id);
}

export function addRecord(store: ContribStore, record: ContribRecord): ContribStore {
  return { records: [...store.records, record] };
}

export function updateRecord(
  store: ContribStore,
  id: string,
  patch: Partial<ContribRecord>,
): ContribStore {
  return {
    records: store.records.map((r) => (r.id === id ? { ...r, ...patch, id: r.id } : r)),
  };
}

/** fs seam: read the store, tolerating a missing file (first run → empty). */
export async function loadStore(path: string = STORE_PATH): Promise<ContribStore> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ContribStore;
    return Array.isArray(parsed.records) ? parsed : emptyStore();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw err;
  }
}

/** fs seam: write the store, creating web/data/ if needed. */
export async function saveStore(store: ContribStore, path: string = STORE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2));
}
