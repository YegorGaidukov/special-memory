"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/api/baseUrl";
import type { MemoryRecord } from "@/lib/manifest/types";

// The phone's read model of the city: the placed memories, for the Explore minimap
// (positions + names) and the Navigate timeline (capture years). Fetches the store
// once on mount; `reload` refetches (e.g. after a contribution, or on entering a mode).
// Only renderable memories (those with a splat) are kept — they exist on the projector,
// so tapping one can actually travel there.
const RENDERABLE = new Set(["ready", "approved"]);

export interface MemoriesApi {
  records: MemoryRecord[];
  reload: () => void;
}

export function useMemories(): MemoriesApi {
  const [records, setRecords] = useState<MemoryRecord[]>([]);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch(`${getApiBaseUrl()}/api/memories`)
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((data) => {
        if (cancelled) return;
        const raw = Array.isArray(data?.records) ? (data.records as MemoryRecord[]) : [];
        setRecords(raw.filter((m) => RENDERABLE.has(m.status) && m.transform?.position));
      })
      .catch(() => {
        /* offline / backend down — keep the last snapshot */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => reload(), [reload]);

  return { records, reload };
}
