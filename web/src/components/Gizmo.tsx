"use client";

import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { axisDragPlaneNormal, axisDragParam, type V3 } from "@/lib/transform/axisDrag";

export type GizmoMode = "translate" | "rotate" | "scale";

const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

// Muted axis triad that sits with the dark UI (cf. --danger/--ok/--accent).
const AXES = [
  { key: "x", dir: new THREE.Vector3(1, 0, 0), color: "#ff9e8c" },
  { key: "y", dir: new THREE.Vector3(0, 1, 0), color: "#8fe9a6" },
  { key: "z", dir: new THREE.Vector3(0, 0, 1), color: "#8ab4ff" },
] as const;

const HOT = "#f4f6ff"; // hovered / active handle
const C = 160; // svg half-extent: the gizmo centre is at (C, C)
const HANDLE_PX = 64; // on-screen handle distance from centre (translate/scale)
const RING_SEG = 48; // segments used to draw a projected rotation ring

type Drag =
  | {
      mode: "translate";
      origin: THREE.Vector3;
      axis: THREE.Vector3;
      // Normal of the camera-facing drag plane (null if the axis points ~along
      // the view, in which case the drag is skipped rather than snapped).
      n: V3 | null;
      s0: number | null;
    }
  | {
      mode: "rotate";
      origin: THREE.Vector3;
      axis: THREE.Vector3;
      plane: THREE.Plane;
      u: THREE.Vector3;
      v: THREE.Vector3;
      a0: number;
      q0: THREE.Quaternion;
    }
  | { mode: "scale"; cx: number; cy: number; startDist: number; s0: number };

/**
 * An HTML/SVG transform gizmo (drei <Html> overlay) bound to an Object3D — the
 * gizmo's drag behaviour without WebGL handles, so it's always crisp and matches
 * the inspector. Pinned to the splat's screen position. Translate slides along a
 * world axis (the handle tracks the pointer); rotate has one grabbable ring per
 * world axis (drawn as the projected circle), each rotating about that axis with
 * the point under the cursor following; scale is a uniform drag. Suspends the
 * default camera controls while dragging.
 */
export default function Gizmo({
  object,
  mode,
  onObjectChange,
  onDraggingChanged,
}: {
  object: THREE.Object3D;
  mode: GizmoMode;
  onObjectChange?: () => void;
  onDraggingChanged?: (dragging: boolean) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const followRef = useRef<THREE.Group>(null);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);
  const knobRefs = useRef<(SVGGElement | null)[]>([]);
  const ringHitRefs = useRef<(SVGPathElement | null)[]>([]);
  const ringVisRefs = useRef<(SVGPathElement | null)[]>([]);

  // Two unit vectors spanning the plane perpendicular to each axis (constant in
  // world space) — used to draw each rotation ring and to measure drag angle.
  const basis = useMemo(
    () =>
      AXES.map((a) => {
        const n = a.dir;
        const u = (Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
          .projectOnPlane(n)
          .normalize();
        const v = new THREE.Vector3().crossVectors(n, u).normalize();
        return { u, v };
      }),
    [],
  );

  const toPx = (n: THREE.Vector3) => ({
    x: (n.x * 0.1 + 0.1) * size.width,
    y: (-n.y * 0.1 + 0.1) * size.height,
  });

  // Pin the overlay to the object and lay out the handles each frame.
  useFrame(() => {
    if (followRef.current) followRef.current.position.copy(object.position);
    const tmp = new THREE.Vector3().copy(object.position).project(camera);
    const c = toPx(tmp);

    if (mode === "rotate") {
      const R = camera.position.distanceTo(object.position) * 0.2;
      basis.forEach((bz, i) => {
        let d = "";
        for (let k = 0; k <= RING_SEG; k++) {
          const th = (k / RING_SEG) * Math.PI * 2;
          tmp
            .copy(object.position)
            .addScaledVector(bz.u, R * Math.cos(th))
            .addScaledVector(bz.v, R * Math.sin(th))
            .project(camera);
          const p = toPx(tmp);
          d += `${k === 0 ? "M" : "L"}${(C + p.x - c.x).toFixed(1)} ${(C + p.y - c.y).toFixed(1)} `;
        }
        d += "Z";
        ringHitRefs.current[i]?.setAttribute("d", d);
        ringVisRefs.current[i]?.setAttribute("d", d);
      });
      return;
    }

    AXES.forEach((a, i) => {
      tmp.copy(object.position).add(a.dir).project(camera);
      const t = toPx(tmp);
      let dx = t.x - c.x;
      let dy = t.y - c.y;
      const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * HANDLE_PX;
      dy = (dy / len) * HANDLE_PX;
      lineRefs.current[i]?.setAttribute("x2", String(C + dx));
      lineRefs.current[i]?.setAttribute("y2", String(C + dy));
      knobRefs.current[i]?.setAttribute("transform", `translate(${C + dx} ${C + dy})`);
    });
  });

  function ndcRay(e: { clientX: number; clientY: number }): THREE.Ray {
    const rect = gl.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(v, camera);
    return rc.ray;
  }

  function screenOf(p: THREE.Vector3): { x: number; y: number } {
    const rect = gl.domElement.getBoundingClientRect();
    const n = p.clone().project(camera);
    return {
      x: rect.left + (n.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-n.y * 0.5 + 0.5) * rect.height,
    };
  }

  function angleInPlane(p: THREE.Vector3, origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3) {
    const w = new THREE.Vector3().subVectors(p, origin);
    return Math.atan2(w.dot(v), w.dot(u));
  }

  function begin(key: string, ne: PointerEvent) {
    const i = AXES.findIndex((a) => a.key === key);
    const origin = object.position.clone();

    if (mode === "translate") {
      const axis = AXES[i].dir.clone();
      // Drag along the axis on a camera-facing plane that contains it; capture
      // the start param so movement is a pure delta (no jump on grab).
      const viewDir = camera.getWorldDirection(new THREE.Vector3());
      const n = axisDragPlaneNormal(v3(axis), v3(viewDir));
      const ray = ndcRay(ne);
      const s0 = n ? axisDragParam(v3(ray.origin), v3(ray.direction), v3(origin), v3(axis), n) : null;
      drag.current = { mode, origin, axis, n, s0 };
    } else if (mode === "rotate") {
      const axis = AXES[i].dir.clone();
      const { u, v } = basis[i];
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, origin);
      const p = new THREE.Vector3();
      const a0 = ndcRay(ne).intersectPlane(plane, p) ? angleInPlane(p, origin, u, v) : 0;
      drag.current = { mode, origin, axis, plane, u: u.clone(), v: v.clone(), a0, q0: object.quaternion.clone() };
    } else {
      const s = screenOf(origin);
      const startDist = Math.hypot(ne.clientX - s.x, ne.clientY - s.y);
      drag.current = { mode, cx: s.x, cy: s.y, startDist: Math.max(1, startDist), s0: object.scale.x };
    }

    if (controls) controls.enabled = false;
    document.body.style.userSelect = "none";
    onDraggingChanged?.(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  function move(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "translate") {
      if (!d.n || d.s0 == null) return; // degenerate grab (axis ~ along view)
      const ray = ndcRay(e);
      const s = axisDragParam(v3(ray.origin), v3(ray.direction), v3(d.origin), v3(d.axis), d.n);
      if (s == null) return;
      object.position.copy(d.origin).addScaledVector(d.axis, s - d.s0);
    } else if (d.mode === "rotate") {
      const p = new THREE.Vector3();
      if (ndcRay(e).intersectPlane(d.plane, p)) {
        const a = angleInPlane(p, d.origin, d.u, d.v);
        object.quaternion
          .copy(d.q0)
          .premultiply(new THREE.Quaternion().setFromAxisAngle(d.axis, a - d.a0));
      }
    } else {
      const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      object.scale.setScalar(Math.max(0.001, (d.s0 * dist) / d.startDist));
    }
    object.updateMatrixWorld();
    onObjectChange?.();
  }

  function end() {
    drag.current = null;
    if (controls) controls.enabled = true;
    document.body.style.userSelect = "";
    setHovered(null);
    onDraggingChanged?.(false);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  }

  const tint = (key: string, base: string) => (hovered === key ? HOT : base);
  const grab = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      begin(key, e.nativeEvent);
    },
    onPointerEnter: () => setHovered(key),
    onPointerLeave: () => {
      if (!drag.current) setHovered(null);
    },
  });

  return (
    <group ref={followRef}>
      <Html center zIndexRange={[8, 8]} style={{ pointerEvents: "none" }}>
        <svg
          width={C * 2}
          height={C * 2}
          style={{ overflow: "visible", display: "block", userSelect: "none" }}
        >
          {mode === "rotate" ? (
            AXES.map((a, i) => (
              <g key={`r-${a.key}`} {...grab(a.key)} style={{ cursor: "grab" }}>
                <path
                  ref={(el) => {
                    ringHitRefs.current[i] = el;
                  }}
                  d=""
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ pointerEvents: "stroke" }}
                />
                <path
                  ref={(el) => {
                    ringVisRefs.current[i] = el;
                  }}
                  d=""
                  fill="none"
                  stroke={tint(a.key, a.color)}
                  strokeWidth={hovered === a.key ? 2.5 : 1.75}
                  style={{ pointerEvents: "none" }}
                />
              </g>
            ))
          ) : (
            <>
              {AXES.map((a, i) => (
                <line
                  key={`l-${a.key}`}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  x1={C}
                  y1={C}
                  x2={C}
                  y2={C}
                  stroke={tint(a.key, a.color)}
                  strokeWidth={hovered === a.key ? 2.5 : 1.75}
                  strokeLinecap="round"
                  style={{ pointerEvents: "none" }}
                />
              ))}
              {AXES.map((a, i) => (
                <g
                  key={`k-${a.key}`}
                  ref={(el) => {
                    knobRefs.current[i] = el;
                  }}
                  transform={`translate(${C} ${C})`}
                  style={{ pointerEvents: "auto", cursor: "grab" }}
                  {...grab(a.key)}
                >
                  <circle r={15} fill="transparent" />
                  {mode === "scale" ? (
                    <rect
                      x={-6}
                      y={-6}
                      width={12}
                      height={12}
                      rx={2.5}
                      fill={tint(a.key, a.color)}
                      stroke="rgba(0,0,0,0.5)"
                      strokeWidth={0.5}
                    />
                  ) : (
                    <circle
                      r={hovered === a.key ? 7.5 : 6}
                      fill={tint(a.key, a.color)}
                      stroke="rgba(0,0,0,0.5)"
                      strokeWidth={0.5}
                    />
                  )}
                </g>
              ))}
            </>
          )}

          {/* centre anchor */}
          <circle cx={C} cy={C} r={3} fill="#cfd6e6" style={{ pointerEvents: "none" }} />
        </svg>
      </Html>
    </group>
  );
}
