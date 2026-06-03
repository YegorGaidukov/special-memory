import { randomUUID } from "node:crypto";

const SAFE = /[^a-z0-9._-]/gi;

/**
 * A filesystem- and url-safe record id derived from the original filename plus a
 * short unique suffix (so two "IMG_1234.jpg" uploads don't collide). The id is
 * also the asset stem S1 matches outputs by, so it must be stable and clean.
 */
export function makeRecordId(originalName: string): string {
  const stem = originalName.replace(/\.[^.]+$/, "").replace(SAFE, "_").slice(0, 40) || "memory";
  return `${stem}-${randomUUID().slice(0, 8)}`;
}

/** Lowercased extension including the dot, defaulting to .jpg. */
export function extOf(originalName: string): string {
  const m = originalName.toLowerCase().match(/\.(jpe?g|png)$/);
  return m ? m[0] : ".jpg";
}
