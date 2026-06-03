import { describe, it, expect } from "vitest";
import { extractPlacement } from "@/lib/exif/placement";

describe("extractPlacement", () => {
  it("pulls decimal lat/lon from exifr output", () => {
    const p = extractPlacement({ latitude: 52.42, longitude: 10.78 });
    expect(p.geo).toEqual({ lat: 52.42, lon: 10.78 });
  });

  it("returns no geo when GPS is absent (messaging-app exports strip it)", () => {
    const p = extractPlacement({ Make: "Apple" });
    expect(p.geo).toBeUndefined();
  });

  it("returns no geo when only one coordinate is present", () => {
    expect(extractPlacement({ latitude: 52.42 }).geo).toBeUndefined();
  });

  it("ignores non-finite coordinates", () => {
    expect(extractPlacement({ latitude: NaN, longitude: 10 }).geo).toBeUndefined();
  });

  it("formats DateTimeOriginal as an ISO capture time", () => {
    const when = new Date("2026-06-02T21:59:01Z");
    expect(extractPlacement({ DateTimeOriginal: when }).captured_at).toBe(
      "2026-06-02T21:59:01.000Z",
    );
  });

  it("falls back to no capture time when the date is missing or invalid", () => {
    expect(extractPlacement({}).captured_at).toBeUndefined();
    expect(extractPlacement({ DateTimeOriginal: "not a date" }).captured_at).toBeUndefined();
  });

  it("returns an empty placement for null/garbage input", () => {
    expect(extractPlacement(null)).toEqual({});
    expect(extractPlacement(undefined)).toEqual({});
  });
});
