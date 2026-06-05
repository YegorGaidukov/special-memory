import { describe, it, expect } from "vitest";
import { safeAssetName, assetContentType } from "@/server/asset";

describe("safeAssetName", () => {
  it("accepts a plain memory asset filename", () => {
    expect(safeAssetName("mem-09-ee62c63c.sog")).toBe("mem-09-ee62c63c.sog");
    expect(safeAssetName("mem-09.preview.ply")).toBe("mem-09.preview.ply");
    expect(safeAssetName("manifest.json")).toBe("manifest.json");
  });

  it("rejects path separators (no sub-directories)", () => {
    expect(safeAssetName("sub/a.sog")).toBeNull();
    expect(safeAssetName("sub\\a.sog")).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(safeAssetName("..")).toBeNull();
    expect(safeAssetName("../secret")).toBeNull();
    expect(safeAssetName("a/../../etc/passwd")).toBeNull();
  });

  it("rejects empty, dot, and NUL-bearing names", () => {
    expect(safeAssetName("")).toBeNull();
    expect(safeAssetName(".")).toBeNull();
    expect(safeAssetName("a\0.sog")).toBeNull();
  });
});

describe("assetContentType", () => {
  it("maps known memory asset extensions", () => {
    expect(assetContentType("a.sog")).toBe("application/octet-stream");
    expect(assetContentType("a.preview.ply")).toBe("application/octet-stream");
    expect(assetContentType("manifest.json")).toBe("application/json; charset=utf-8");
    expect(assetContentType("a.jpg")).toBe("image/jpeg");
    expect(assetContentType("a.JPEG")).toBe("image/jpeg");
    expect(assetContentType("a.png")).toBe("image/png");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(assetContentType("a.unknown")).toBe("application/octet-stream");
    expect(assetContentType("noext")).toBe("application/octet-stream");
  });
});
