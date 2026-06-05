// Pure helpers for the dynamic memory-asset route (app/api/asset/[name]). Memory
// assets (.sog / .preview.ply / .jpg / manifest.json) are written into
// PUBLIC_MEMORIES_DIR at RUNTIME by the GPU watcher's ingest, but Next only
// serves files in public/ that existed at BUILD time — so a live drop's splat
// 404s on `next start`. Serving the directory through a route handler that reads
// from disk per request fixes that. These two functions are the route's pure,
// unit-testable core (filename safety + content type); the fs read is the seam.

import { extname } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".sog": "application/octet-stream",
  ".ply": "application/octet-stream",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/** Content type for an asset filename, defaulting to a binary download. */
export function assetContentType(name: string): string {
  return CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Validate a requested asset filename, returning the clean name or null if
 * unsafe. The route serves a flat directory, so a valid name is a single path
 * segment with no separators, no traversal (`..`), and no NUL — this is the
 * guard against escaping PUBLIC_MEMORIES_DIR.
 */
export function safeAssetName(name: string): string | null {
  if (!name || name === "." || name === "..") return null;
  if (/[\\/\0]/.test(name)) return null;
  if (name.includes("..")) return null;
  return name;
}
