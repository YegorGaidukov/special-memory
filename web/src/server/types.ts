import type { MemoryRecord } from "@/lib/manifest/types";

/**
 * The full contribution record. Extends the explorer's MemoryRecord with the
 * server-only original-image filename. Unlike the explorer (which only ever sees
 * renderable records), the store holds every lifecycle state.
 */
export interface ContribRecord extends MemoryRecord {
  /** Filename of the stored original under UPLOADS_DIR (provenance + re-runs). */
  source_image: string;
}

export interface ContribStore {
  records: ContribRecord[];
}
