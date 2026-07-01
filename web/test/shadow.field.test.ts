import { describe, expect, it } from "vitest";
import { MAX_BLOBS, makeBlobs, packBlobs, SHADOW } from "@/lib/shadow/field";

describe("makeBlobs", () => {
  it("is deterministic for a given viewport", () => {
    expect(makeBlobs(390, 844)).toEqual(makeBlobs(390, 844));
  });

  it("scales count with area, clamped to [8, MAX_BLOBS]", () => {
    expect(makeBlobs(10, 10).length).toBe(8);
    expect(makeBlobs(4000, 4000).length).toBe(MAX_BLOBS);
    const n = makeBlobs(390, 844).length;
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(MAX_BLOBS);
  });

  it("keeps blobs inside the viewport with radii/opacity in the knob ranges", () => {
    for (const b of makeBlobs(390, 844)) {
      expect(b.cx).toBeGreaterThanOrEqual(0);
      expect(b.cx).toBeLessThanOrEqual(390);
      expect(b.rx).toBeGreaterThanOrEqual(SHADOW.minR);
      expect(b.rx).toBeLessThanOrEqual(SHADOW.maxR);
      expect(b.o).toBeGreaterThanOrEqual(SHADOW.minO);
      expect(b.o).toBeLessThanOrEqual(SHADOW.maxO);
    }
  });
});

describe("packBlobs", () => {
  it("packs cx, cy, mean radius, opacity into MAX_BLOBS vec4 slots", () => {
    const packed = packBlobs([{ cx: 10, cy: 20, rx: 90, ry: 100, o: 0.7 }]);
    expect(packed.length).toBe(MAX_BLOBS * 4);
    expect(Array.from(packed.slice(0, 4))).toEqual([10, 20, 95, expect.closeTo(0.7)]);
    expect(Array.from(packed.slice(4, 8))).toEqual([0, 0, 0, 0]); // unused slots zeroed
  });
});
