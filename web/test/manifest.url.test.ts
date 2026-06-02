import { describe, it, expect } from "vitest";
import { resolveAssetUrl } from "@/lib/manifest/url";

describe("resolveAssetUrl", () => {
  it("joins a base path and a relative asset path", () => {
    expect(resolveAssetUrl("/memories", "a.ply")).toBe("/memories/a.ply");
  });

  it("does not double the slash when base has a trailing slash", () => {
    expect(resolveAssetUrl("/memories/", "a.ply")).toBe("/memories/a.ply");
  });

  it("strips a leading slash on the asset path to avoid a double slash", () => {
    expect(resolveAssetUrl("/memories", "/a.ply")).toBe("/memories/a.ply");
  });

  it("joins against an absolute base URL (CDN)", () => {
    expect(resolveAssetUrl("https://cdn.example.com/m", "a.ply")).toBe(
      "https://cdn.example.com/m/a.ply",
    );
  });

  it("returns an already-absolute asset URL unchanged", () => {
    expect(resolveAssetUrl("/memories", "https://cdn.example.com/a.ply")).toBe(
      "https://cdn.example.com/a.ply",
    );
  });
});
