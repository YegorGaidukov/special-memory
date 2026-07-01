import { toIso } from "@/lib/date/calendar";

/**
 * ISO day (YYYY-MM-DD) for the Add screen's date prefill, from an exifr-parsed
 * object's `DateTimeOriginal`. EXIF datetimes carry no zone, so exifr yields a
 * local-time Date — the local calendar day is the day the camera recorded.
 */
export function captureIsoDay(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const when = (raw as Record<string, unknown>).DateTimeOriginal;
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) return null;
  return toIso(when.getFullYear(), when.getMonth(), when.getDate());
}
