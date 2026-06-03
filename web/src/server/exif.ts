import exifr from "exifr";
import { extractPlacement, type ExifPlacement } from "@/lib/exif/placement";

/**
 * The un-testable binary seam: run exifr over an image buffer, then hand its
 * output to the pure normalizer. `gps: true` makes exifr compute decimal
 * latitude/longitude. Any parse failure (no EXIF at all) yields an empty
 * placement — the curator then sets the pin manually.
 */
export async function parsePlacement(buffer: Buffer): Promise<ExifPlacement> {
  try {
    const raw = await exifr.parse(buffer, { gps: true });
    return extractPlacement(raw);
  } catch {
    return {};
  }
}
