import { describe, expect, it } from "vitest";
import { parseCssColor } from "@/lib/shadow/color";

describe("parseCssColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseCssColor("#b7b9c4")).toEqual([
      expect.closeTo(0xb7 / 255),
      expect.closeTo(0xb9 / 255),
      expect.closeTo(0xc4 / 255),
    ]);
  });

  it("parses 3-digit hex", () => {
    expect(parseCssColor("#fff")).toEqual([1, 1, 1]);
  });

  it("parses rgb() with commas or spaces, with surrounding whitespace", () => {
    expect(parseCssColor(" rgb(255, 0, 128) ")).toEqual([1, 0, expect.closeTo(128 / 255)]);
    expect(parseCssColor("rgb(255 0 128)")).toEqual([1, 0, expect.closeTo(128 / 255)]);
  });

  it("returns null for empty/garbage", () => {
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("var(--wall)")).toBeNull();
    expect(parseCssColor("#12")).toBeNull();
  });
});
