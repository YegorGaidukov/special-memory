import type { Geo } from "@/lib/manifest/types";

export interface ExifPlacement {
  geo?: Geo;
  captured_at?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Normalize an exifr-parsed object into the placement fields S3 stores. exifr
 * already yields decimal `latitude`/`longitude` and a `DateTimeOriginal` Date.
 * GPS is optional — messaging-app exports strip it, so absence is normal, not an
 * error (the curator then places the pin manually on the map).
 */
export function extractPlacement(raw: unknown): ExifPlacement {
  if (typeof raw !== "object" || raw === null) return {};
  const exif = raw as Record<string, unknown>;
  const placement: ExifPlacement = {};

  if (isFiniteNumber(exif.latitude) && isFiniteNumber(exif.longitude)) {
    placement.geo = { lat: exif.latitude, lon: exif.longitude };
  }

  const when = exif.DateTimeOriginal;
  if (when instanceof Date && !Number.isNaN(when.getTime())) {
    placement.captured_at = when.toISOString();
  }

  return placement;
}
