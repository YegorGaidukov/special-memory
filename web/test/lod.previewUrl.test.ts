import { describe, it, expect } from "vitest";
import { previewUrlFor } from "@/lib/lod/previewUrl";

describe("previewUrlFor", () => {
  it("swaps a .sog splat for its .preview.ply", () => {
    expect(previewUrlFor("photo_2026.sog")).toBe("photo_2026.preview.ply");
  });

  it("handles a raw .ply splat", () => {
    expect(previewUrlFor("mem-01.ply")).toBe("mem-01.preview.ply");
  });

  it("is case-insensitive on the extension", () => {
    expect(previewUrlFor("A.SOG")).toBe("A.preview.ply");
  });

  it("only strips the trailing splat extension, not dots in the stem", () => {
    expect(previewUrlFor("photo.2026-06-02.sog")).toBe(
      "photo.2026-06-02.preview.ply",
    );
  });

  it("leaves an unrecognised extension in place (appends preview)", () => {
    expect(previewUrlFor("weird.bin")).toBe("weird.bin.preview.ply");
  });
});
