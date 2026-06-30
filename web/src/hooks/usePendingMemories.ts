"use client";

import { useEffect, useState } from "react";
import type { ContribRecord } from "@/server/types";
import { getApiBaseUrl } from "@/lib/api/baseUrl";

const POLL_MS = 3000;

/**
 * Poll the server store (all lifecycle states) so the explorer can draw
 * placeholder spheres for in-flight memories and detect when one is published.
 * Returns the full record list (empty until the first successful poll).
 */
export function usePendingMemories(): ContribRecord[] {
  const [records, setRecords] = useState<ContribRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const r = await fetch(`${getApiBaseUrl()}/api/memories`);
        if (r.ok) {
          const store = await r.json();
          if (!cancelled && Array.isArray(store.records)) setRecords(store.records);
        }
      } catch {
        // transient (e.g. server restart) — the next tick retries.
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return records;
}
