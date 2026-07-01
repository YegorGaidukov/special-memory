"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { makeBlobs, MAX_BLOBS, packBlobs, SHADOW } from "@/lib/shadow/field";
import { parseCssColor } from "@/lib/shadow/color";
import styles from "./mobile.module.css";

// The signature 5b visual: a living dappled leaf-shadow field. Light ellipses over a
// darker wall, domain-warped by animated fbm noise — the GPU equivalent of the old
// feTurbulence + feDisplacementMap SVG filter, which iOS Safari can render but never
// animate (WebKit ignores SMIL on filter primitives; two CSS-level workarounds failed).
// A raw WebGL1 fragment shader morphs identically on every platform. It renders at a
// fraction of the display resolution and is upscaled by CSS — that IS the gaussian
// blur, for free, and keeps the GPU cost trivial. Colours come from the CSS tokens
// (--wall / --light, inherited by the canvas). If WebGL is unavailable the static SVG
// (no SMIL) renders instead.
const RENDER_SCALE = 0.4;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
#define MAX_BLOBS ${MAX_BLOBS}
uniform vec2 u_res;              // drawing-buffer px
uniform vec2 u_size;             // field size in CSS px (blob space)
uniform float u_time;            // seconds
uniform vec3 u_wall;
uniform vec3 u_light;
uniform vec4 u_blobs[MAX_BLOBS]; // cx, cy, r, opacity — CSS px
uniform int u_count;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = gl_FragCoord.xy / u_res * u_size;
  p.y = u_size.y - p.y; // blob layout is y-down (SVG heritage)
  float t = u_time * 0.3;
  vec2 warp = vec2(
    fbm(p * 0.007 + vec2(t, -0.7 * t)),
    fbm(p * 0.007 + vec2(-0.8 * t, t) + vec2(37.2, 11.9))
  ) - 0.5;
  vec2 q = p + warp * ${SHADOW.displace.toFixed(1)};
  float sum = 0.0;
  for (int i = 0; i < MAX_BLOBS; i++) {
    if (i >= u_count) break;
    vec4 b = u_blobs[i];
    float d = distance(q, b.xy);
    sum += b.w * smoothstep(b.z * 1.6, b.z * 0.3, d); // wide feather = the old blur
  }
  vec3 col = mix(u_wall, u_light, clamp(sum, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

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

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("ShadowField shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function ShadowField() {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
    });
    if (!gl) {
      setFallback(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setFallback(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("ShadowField link:", gl.getProgramInfoLog(prog));
      setFallback(true);
      return;
    }
    gl.useProgram(prog);

    // Fullscreen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, "u_res"),
      size: gl.getUniformLocation(prog, "u_size"),
      time: gl.getUniformLocation(prog, "u_time"),
      wall: gl.getUniformLocation(prog, "u_wall"),
      light: gl.getUniformLocation(prog, "u_light"),
      blobs: gl.getUniformLocation(prog, "u_blobs"),
      count: gl.getUniformLocation(prog, "u_count"),
    };

    // Colours from the CSS tokens the canvas inherits (single source with the chrome).
    const style = getComputedStyle(canvas);
    const wall = parseCssColor(style.getPropertyValue("--wall")) ?? [0.72, 0.73, 0.77];
    const light = parseCssColor(style.getPropertyValue("--light")) ?? [0.98, 0.96, 0.92];
    gl.uniform3fv(u.wall, wall);
    gl.uniform3fv(u.light, light);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * RENDER_SCALE));
      canvas.height = Math.max(1, Math.round(h * RENDER_SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform2f(u.size, w, h);
      const blobs = makeBlobs(w, h);
      gl.uniform4fv(u.blobs, packBlobs(blobs));
      gl.uniform1i(u.count, Math.min(blobs.length, MAX_BLOBS));
    };
    resize();

    const draw = (ms: number) => {
      gl.uniform1f(u.time, ms / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let raf = 0;
    const loop = (ms: number) => {
      draw(ms);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!reduced && raf === 0 && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    };

    if (reduced) draw(0); // hold a static frame — same policy as the old SMIL gate
    else start();

    const onResize = () => {
      resize();
      if (reduced || document.hidden) draw(reduced ? 0 : performance.now());
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [reduced]);

  if (fallback) return <StaticField />;
  return <canvas ref={canvasRef} className={styles.fieldCanvas} aria-hidden />;
}

/** No-WebGL fallback: the field as a static SVG (the filter renders fine everywhere —
 *  only its animation doesn't — so this matches the reduced-motion look). */
function StaticField() {
  const w = typeof window === "undefined" ? 390 : window.innerWidth;
  const h = typeof window === "undefined" ? 844 : window.innerHeight;
  const blobs = makeBlobs(w, h);
  return (
    <svg
      className={styles.field}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id="cmc-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.009"
            numOctaves={1}
            seed={SHADOW.seed}
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale={SHADOW.displace}
            xChannelSelector="R"
            yChannelSelector="G"
            result="d"
          />
          <feGaussianBlur in="d" stdDeviation={16} />
        </filter>
      </defs>
      <rect width={w} height={h} style={{ fill: "var(--wall)" }} />
      <g filter="url(#cmc-shadow)" style={{ fill: "var(--light)" }}>
        {blobs.map((e, i) => (
          <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} opacity={e.o} />
        ))}
      </g>
    </svg>
  );
}
