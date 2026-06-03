import { describe, it, expect } from "vitest";
import { expectedAssets, resolveIngest } from "@/server/ingest";

describe("expectedAssets", () => {
  it("derives the asset filenames S1+convert-splats produce for an id", () => {
    expect(expectedAssets("photo_42")).toEqual({
      splat: "photo_42.sog",
      preview: "photo_42.preview.ply",
      thumbnail: "photo_42.jpg",
    });
  });
});

describe("resolveIngest", () => {
  it("returns ready + urls when the splat and thumb are present", () => {
    const present = new Set(["photo_42.sog", "photo_42.preview.ply", "photo_42.jpg"]);
    expect(resolveIngest("photo_42", present)).toEqual({
      ok: true,
      patch: { status: "ready", splat_url: "photo_42.sog", thumbnail_url: "photo_42.jpg" },
    });
  });

  it("fails when the splat is missing (S1 hasn't run / failed)", () => {
    const present = new Set(["photo_42.jpg"]);
    expect(resolveIngest("photo_42", present)).toEqual({
      ok: false,
      reason: "splat photo_42.sog not found in public/memories",
    });
  });

  it("still readies without a thumbnail (thumb is optional for rendering)", () => {
    const present = new Set(["photo_42.sog"]);
    const out = resolveIngest("photo_42", present);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.patch.thumbnail_url).toBe("");
  });
});
