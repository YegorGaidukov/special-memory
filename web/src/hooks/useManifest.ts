"use client";

import { useEffect, useState } from "react";
import { MANIFEST_URL } from "@/config/explorer";
import { parseManifest } from "@/lib/manifest/parse";
import type { ExplorerManifest } from "@/lib/manifest/types";

export type ManifestState =
  | { status: "loading" }
  | { status: "ready"; manifest: ExplorerManifest }
  | { status: "error"; error: string };

/**
 * Fetch + parse the explorer manifest on the client. Kept client-side (not in a
 * server component) so the whole explorer is one ssr:false unit and the
 * configurable base URL works the same for a local folder or a remote CDN.
 */
export function useManifest(): ManifestState {
  const [state, setState] = useState<ManifestState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest fetch failed (${r.status})`);
        return r.json();
      })
      .then((raw) => parseManifest(raw))
      .then((manifest) => {
        if (!cancelled) setState({ status: "ready", manifest });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ status: "error", error: String(err?.message ?? err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
