import { describe, it, expect } from "vitest";
import { makeRecordId, extOf } from "@/server/id";

describe("extOf", () => {
  it("returns the lowercased extension for jpg/jpeg/png", () => {
    expect(extOf("Photo.JPG")).toBe(".jpg");
    expect(extOf("a.jpeg")).toBe(".jpeg");
    expect(extOf("b.PNG")).toBe(".png");
  });
  it("defaults to .jpg for unknown/missing extensions", () => {
    expect(extOf("noext")).toBe(".jpg");
    expect(extOf("weird.gif")).toBe(".jpg");
  });
});

describe("makeRecordId", () => {
  it("derives a filesystem/url-safe id from the filename stem + an 8-char suffix", () => {
    expect(makeRecordId("IMG_1234.jpg")).toMatch(/^IMG_1234-[a-f0-9]{8}$/);
  });
  it("replaces unsafe characters with underscores", () => {
    expect(makeRecordId("my photo (1)!.png")).toMatch(/^my_photo__1__-[a-f0-9]{8}$/);
  });
  it("produces a different id each call (unique suffix)", () => {
    expect(makeRecordId("x.jpg")).not.toBe(makeRecordId("x.jpg"));
  });
  it("falls back to 'memory' when the stem is empty", () => {
    expect(makeRecordId(".jpg")).toMatch(/^memory-[a-f0-9]{8}$/);
  });
});
