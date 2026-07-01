// Pure layout for the 5b shadow field: soft light ellipses scattered over the wall
// colour, later domain-warped by the WebGL shader (ShadowField.tsx). Only numeric
// knobs live here; the two COLOURS stay in the CSS as --wall / --light.
export const SHADOW = {
  seed: 4,
  displace: 120, // "spread" — noise domain-warp amplitude (px)
  minR: 80, // blob radius range (px)
  maxR: 130,
  minO: 0.9, // blob opacity range
  maxO: 1,
  // One blob per this much area (px²) — sets the dapple density at any viewport.
  areaPerBlob: (500 * 600) / 4,
};

/** Shader-side cap for `uniform vec4 u_blobs[MAX_BLOBS]` (WebGL1 loops need a
 *  compile-time bound; 80 vec4s sit comfortably under mobile uniform limits). */
export const MAX_BLOBS = 80;

// Deterministic PRNG (mulberry32) so the field is stable across renders — and no
// Math.random (which the workflow environment forbids anyway).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 16), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  o: number;
}

export function makeBlobs(w: number, h: number): Ellipse[] {
  const rnd = mulberry32(SHADOW.seed);
  const n = Math.min(MAX_BLOBS, Math.max(8, Math.round((w * h) / SHADOW.areaPerBlob)));
  const lerp = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const out: Ellipse[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      cx: rnd() * w,
      cy: rnd() * h,
      rx: lerp(SHADOW.minR, SHADOW.maxR),
      ry: lerp(SHADOW.minR, SHADOW.maxR),
      o: lerp(SHADOW.minO, SHADOW.maxO),
    });
  }
  return out;
}

/** Pack blobs for the shader's `uniform vec4 u_blobs[MAX_BLOBS]`: cx, cy, r, opacity.
 *  Blobs are near-circular (rx/ry within 90–100 px), so the mean radius stands in. */
export function packBlobs(blobs: Ellipse[]): Float32Array {
  const out = new Float32Array(MAX_BLOBS * 4);
  for (let i = 0; i < Math.min(blobs.length, MAX_BLOBS); i++) {
    const b = blobs[i];
    out[i * 4] = b.cx;
    out[i * 4 + 1] = b.cy;
    out[i * 4 + 2] = (b.rx + b.ry) / 2;
    out[i * 4 + 3] = b.o;
  }
  return out;
}
