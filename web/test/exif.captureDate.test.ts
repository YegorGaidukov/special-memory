import { describe, expect, it } from "vitest";
import { captureIsoDay } from "@/lib/exif/captureDate";

describe("captureIsoDay", () => {
  it("maps DateTimeOriginal to a local ISO day", () => {
    // exifr parses EXIF's zone-less "2026:04:27 14:03:00" as a local Date; the day
    // the camera recorded is the local calendar day, so read local components.
    const raw = { DateTimeOriginal: new Date(2026, 3, 27, 14, 3, 0) };
    expect(captureIsoDay(raw)).toBe("2026-04-27");
  });

  it("pads month and day", () => {
    expect(captureIsoDay({ DateTimeOriginal: new Date(2026, 0, 5) })).toBe("2026-01-05");
  });

  it("returns null for missing/invalid values", () => {
    expect(captureIsoDay(undefined)).toBeNull();
    expect(captureIsoDay(null)).toBeNull();
    expect(captureIsoDay({})).toBeNull();
    expect(captureIsoDay({ DateTimeOriginal: "2026:04:27" })).toBeNull();
    expect(captureIsoDay({ DateTimeOriginal: new Date(NaN) })).toBeNull();
  });
});
