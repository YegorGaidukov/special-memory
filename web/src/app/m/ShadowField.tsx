"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import styles from "./mobile.module.css";

// The signature 5b visual: a living dappled leaf-shadow field. Soft light ellipses are
// warped by an animated fractal-noise displacement filter over a darker wall, so the
// masses drift and morph like light shifting through swaying leaves. ONE shared field
// sits behind every mode (Add / Navigate / Explore) — no per-mode variants, so it stays
// continuous as you switch modes rather than re-seeding.
//
// 5b is INVERTED: the wall is the static shade and the drifting ellipses are LIGHT. The
// two COLOURS live in the CSS as --wall / --light (single source, shared with the rest
// of the UI); the SVG reads them via inline `style` (presentation attributes can't take
// var()). Only the numeric knobs stay here — SVG filter primitives need literals.
const SHADOW = {
  seed: 4,
  freqRest: "0.006 0.009", // feTurbulence baseFrequency (px⁻¹): rest / peak of the loop
  freqPeak: "0.0086 0.012",
  dur: 17, // baseFrequency animation duration (s)
  displace: 180, // "spread" — feDisplacementMap scale (px)
  blur: 16, // "softness" — feGaussianBlur stdDeviation (px)
  octaves: 1,
  minR: 90, // blob radius range (px)
  maxR: 100,
  minO: 0.5, // blob opacity range
  maxO: 1,
  // One blob per this much area (px²) — sets the dapple density at any viewport.
  areaPerBlob: (250 * 600) / 6,
};

// Deterministic PRNG (mulberry32) so the field is stable across renders — and no
// Math.random (which the workflow environment forbids anyway).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  o: number;
}

function makeBlobs(w: number, h: number): Ellipse[] {
  const rnd = mulberry32(SHADOW.seed);
  const n = Math.min(80, Math.max(8, Math.round((w * h) / SHADOW.areaPerBlob)));
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

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the OS "reduce motion" preference is set (SSR-safe: false on the server). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false,
  );
}

/** Live viewport size. Defaults to the phone canvas for SSR/first paint (so server and
 *  client agree), then tracks the real window after mount. */
function useViewport(): { w: number; h: number } {
  const [size, setSize] = useState({ w: 288, h: 600 });
  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return size;
}

export default function ShadowField() {
  const reduced = useReducedMotion();
  const { w, h } = useViewport();
  const blobs = useMemo(() => makeBlobs(w, h), [w, h]);

  return (
    <svg className={styles.field} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id="cmc-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={SHADOW.freqRest}
            numOctaves={SHADOW.octaves}
            seed={SHADOW.seed}
            result="n"
          >
            {/* SMIL can't be paused by CSS, so under reduced-motion we omit it — the
                noise field then holds a static frame. */}
            {!reduced && (
              <animate
                attributeName="baseFrequency"
                dur={`${SHADOW.dur}s`}
                calcMode="spline"
                keyTimes="0;0.5;1"
                keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
                values={`${SHADOW.freqRest};${SHADOW.freqPeak};${SHADOW.freqRest}`}
                repeatCount="indefinite"
              />
            )}
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale={SHADOW.displace}
            xChannelSelector="R"
            yChannelSelector="G"
            result="d"
          />
          <feGaussianBlur in="d" stdDeviation={SHADOW.blur} />
        </filter>
      </defs>
      {/* Colours come from the CSS tokens (--wall / --light) via style — SVG
          presentation attributes don't resolve var(). The ellipses inherit fill from
          the group. */}
      <rect width={w} height={h} style={{ fill: "var(--wall)" }} />
      <g filter="url(#cmc-shadow)" className={reduced ? undefined : styles.drift} style={{ fill: "var(--light)" }}>
        {blobs.map((e, i) => (
          <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} opacity={e.o} />
        ))}
      </g>
    </svg>
  );
}
