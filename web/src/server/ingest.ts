import { readdir } from "node:fs/promises";
import type { ContribRecord } from "./types";
import { PUBLIC_MEMORIES_DIR } from "./paths";

export interface ExpectedAssets {
  splat: string;
  preview: string;
  thumbnail: string;
}

/** Filenames S1 + `npm run convert-splats` produce for a record id (by stem). */
export function expectedAssets(id: string): ExpectedAssets {
  return { splat: `${id}.sog`, preview: `${id}.preview.ply`, thumbnail: `${id}.jpg` };
}

export type IngestResult =
  | { ok: true; patch: Partial<ContribRecord> }
  | { ok: false; reason: string };

/**
 * Pure: given the set of filenames present in public/memories, decide whether a
 * record can transition to `ready` and which urls to attach. The splat is
 * required; the thumbnail is optional (used only for far billboards/UI).
 */
export function resolveIngest(id: string, present: ReadonlySet<string>): IngestResult {
  const assets = expectedAssets(id);
  if (!present.has(assets.splat)) {
    return { ok: false, reason: `splat ${assets.splat} not found in public/memories` };
  }
  return {
    ok: true,
    patch: {
      status: "ready",
      splat_url: assets.splat,
      thumbnail_url: present.has(assets.thumbnail) ? assets.thumbnail : "",
    },
  };
}

/** fs seam: list public/memories and run resolveIngest against it. */
export async function ingestFromDisk(id: string): Promise<IngestResult> {
  const present = new Set(await readdir(PUBLIC_MEMORIES_DIR));
  return resolveIngest(id, present);
}
