"use client";

import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { axisDragPlaneNormal, axisDragParam, type V3 } from "@/lib/transform/axisDrag";

// One handle does one thing. A Rhino-style "gumball" shows them all at once (no
// mode switch): per-axis move arrows, dotted scale handles, rotation arcs, plus a
// planar "Move 2D" grid that slides in the view plane.
export type GizmoAction = "translate" | "rotate" | "scale" | "planar";

const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

// Muted axis triad that sits with the dark UI (cf. --danger/--ok/--accent).
const AXES = [
  { key: "x", dir: new THREE.Vector3(1, 0, 0), color: "#ff6b6b" },
  { key: "y", dir: new THREE.Vector3(0, 1, 0), color: "#54d98c" },
  { key: "z", dir: new THREE.Vector3(0, 0, 1), color: "#6b9bff" },
] as const;

const HOT = "#f4f6ff"; // hovered / active handle
const C = 400; // svg half-extent: the gizmo centre is at (C, C)
const ARROW_PX = 300; // move-arrow tip distance from centre
const SCALE_PX = 200; // scale square distance (opposite side of the same axis)
const ARC_PX = 200; // rotation-arc radius (target screen size of the projected circle)
const ARC_SEG = 24; // segments used to draw each (projected) rotation arc
const HEAD = 50; // arrowhead length
const PLANAR_R = -150; // Move-2D grid offset from centre (along its plane diagonal)
const PLANAR_SIZE = 100; // Move-2D grid side length (world-sized, projected)

// The three coordinate planes the Move-2D handle can drag in, by axis index:
// `n` = plane normal, (`a`,`b`) = the two in-plane axes.
const PLANES = [
  { n: 2, a: 0, b: 1 }, // XY (normal Z)
  { n: 0, a: 1, b: 2 }, // YZ (normal X)
  { n: 1, a: 0, b: 2 }, // XZ (normal Y)
] as const;

// A handle is identified by its axis + action, e.g. "x-translate". The planar
// grid has no axis.
const hid = (axis: string, action: GizmoAction) => (action === "planar" ? "planar" : `${axis}-${action}`);

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
  | { mode: "scale"; cx: number; cy: number; startDist: number; s0: number }
  | { mode: "planar"; origin: THREE.Vector3; plane: THREE.Plane; hit0: THREE.Vector3 };

const headPath = `M0 0 L${-HEAD} ${-HEAD * 0.5} L${-HEAD} ${HEAD * 0.5} Z`;

/**
 * An HTML/SVG transform gizmo (drei <Html> overlay) bound to an Object3D — a
 * unified Rhino "gumball" with every handle visible at once, so the curator
 * never switches modes. Pinned to the splat's screen position and always crisp.
 * Per axis: a solid arrow slides the splat along that world axis; a dotted line
 * to a hollow square (opposite side) drives uniform scale; a quarter-circle arc
 * rotates about that axis. A small grid near the centre slides the splat in the
 * view plane ("Move 2D"). Suspends the default camera controls while dragging.
 */
export default function Gizmo({
  object,
  onObjectChange,
  onDraggingChanged,
}: {
  object: THREE.Object3D;
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
  const arrowHitRefs = useRef<(SVGLineElement | null)[]>([]);
  const arrowLineRefs = useRef<(SVGLineElement | null)[]>([]);
  const arrowHeadRefs = useRef<(SVGGElement | null)[]>([]);
  const scaleLineRefs = useRef<(SVGLineElement | null)[]>([]);
  const scaleKnobRefs = useRef<(SVGGElement | null)[]>([]);
  const arcHitRefs = useRef<(SVGPathElement | null)[]>([]);
  const arcVisRefs = useRef<(SVGPathElement | null)[]>([]);
  const gridFillRef = useRef<SVGPathElement>(null);
  const gridLineRef = useRef<SVGPathElement>(null);
  // Which coordinate plane the Move-2D handle currently drags in (index into
  // PLANES, -1 = uninitialised) and that plane's world normal — shared between
  // the per-frame draw and the drag start.
  const planeIdx = useRef(-1);
  const planeNormal = useRef(new THREE.Vector3(0, 0, 1));

  // Two unit vectors spanning the plane perpendicular to each axis (constant in
  // world space) — the rotate drag measures its angle in this basis.
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

  // Pin the overlay to the object and lay out every handle each frame.
  useFrame(() => {
    if (followRef.current) followRef.current.position.copy(object.position);
    const proj = new THREE.Vector3().copy(object.position).project(camera);
    const c = toPx(proj);

    // World→screen scale at the object's depth: a world length L projects to
    // roughly L·projScale/dist pixels. `uw` inverts it (px → world length), so
    // every handle is placed at a fixed WORLD offset and projected — which makes
    // an axis foreshorten and collapse to the centre when the camera looks along
    // it, instead of staying a constant on-screen length.
    const dist = camera.position.distanceTo(object.position);
    const cam = camera as THREE.PerspectiveCamera;
    const fov = ((cam.isPerspectiveCamera ? cam.fov : 60) * Math.PI) / 180;
    const projScale = size.height / 2 / Math.tan(fov / 2);
    const uw = (px: number) => (px * dist) / projScale;
    const Larrow = uw(ARROW_PX);
    const Lscale = uw(SCALE_PX);

    AXES.forEach((a, i) => {
      // Move arrow: tip a fixed world distance along +axis, projected.
      proj.copy(object.position).addScaledVector(a.dir, Larrow).project(camera);
      let t = toPx(proj);
      const tx = t.x - c.x;
      const ty = t.y - c.y;
      arrowHitRefs.current[i]?.setAttribute("x2", String(C + tx));
      arrowHitRefs.current[i]?.setAttribute("y2", String(C + ty));
      arrowLineRefs.current[i]?.setAttribute("x2", String(C + tx));
      arrowLineRefs.current[i]?.setAttribute("y2", String(C + ty));
      const deg = (Math.atan2(ty, tx) * 180) / Math.PI;
      // Shrink the arrowhead as the axis foreshortens so it vanishes with the shaft.
      const k = Math.min(1, Math.hypot(tx, ty) / ARROW_PX);
      arrowHeadRefs.current[i]?.setAttribute(
        "transform",
        `translate(${C + tx} ${C + ty}) rotate(${deg}) scale(${k.toFixed(3)})`,
      );
      // Scale handle: opposite (−axis) side, also world-placed so it collapses too.
      proj.copy(object.position).addScaledVector(a.dir, -Lscale).project(camera);
      t = toPx(proj);
      const sx = t.x - c.x;
      const sy = t.y - c.y;
      scaleLineRefs.current[i]?.setAttribute("x2", String(C + sx));
      scaleLineRefs.current[i]?.setAttribute("y2", String(C + sy));
      scaleKnobRefs.current[i]?.setAttribute("transform", `translate(${C + sx} ${C + sy})`);
    });

    // Rotation arcs: a quarter of the ACTUAL 3D circle in each axis's
    // perpendicular plane (spanning the two other +axes), projected to screen so
    // it reads as an ellipse that adapts to the view — the corner-of-a-sphere
    // fan. Sized in world units so it projects to ~ARC_PX regardless of distance.
    const Rworld = (ARC_PX * dist) / projScale;
    AXES.forEach((_, i) => {
      const dj = AXES[(i + 1) % 3].dir;
      const dk = AXES[(i + 2) % 3].dir;
      let path = "";
      for (let n = 0; n <= ARC_SEG; n++) {
        const th = (n / ARC_SEG) * (Math.PI / 2);
        proj
          .copy(object.position)
          .addScaledVector(dj, Rworld * Math.cos(th))
          .addScaledVector(dk, Rworld * Math.sin(th))
          .project(camera);
        const p = toPx(proj);
        path += `${n === 0 ? "M" : "L"}${(C + p.x - c.x).toFixed(1)} ${(C + p.y - c.y).toFixed(1)} `;
      }
      arcHitRefs.current[i]?.setAttribute("d", path);
      arcVisRefs.current[i]?.setAttribute("d", path);
    });

    // Move-2D: drag in the coordinate plane most face-on to the camera, and draw
    // the grid square lying IN that plane (projected, so it foreshortens with the
    // view). Hysteresis keeps the choice from flickering between planes near 45°.
    const vd = camera.getWorldDirection(new THREE.Vector3());
    const facing = (p: number) => Math.abs(AXES[PLANES[p].n].dir.dot(vd));
    let bestP = 0;
    for (let p = 1; p < 3; p++) if (facing(p) > facing(bestP)) bestP = p;
    if (planeIdx.current >= 0 && facing(bestP) < facing(planeIdx.current) + 0.15)
      bestP = planeIdx.current;
    planeIdx.current = bestP;
    const pl = PLANES[bestP];
    const A = AXES[pl.a].dir;
    const B = AXES[pl.b].dir;
    planeNormal.current.copy(AXES[pl.n].dir);

    const half = uw(PLANAR_SIZE / 2);
    const off = uw(PLANAR_R) * 0.7; // sit out along the plane diagonal
    const cen = new THREE.Vector3()
      .copy(object.position)
      .addScaledVector(A, off)
      .addScaledVector(B, off);
    const corners = ([
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const).map(([sa, sb]) => {
      proj.copy(cen).addScaledVector(A, sa * half).addScaledVector(B, sb * half).project(camera);
      const p = toPx(proj);
      return { x: C + p.x - c.x, y: C + p.y - c.y };
    });
    const f = (n: number) => `${corners[n].x.toFixed(1)} ${corners[n].y.toFixed(1)}`;
    const square = `M${f(0)} L${f(1)} L${f(2)} L${f(3)} Z`;
    const mid = (i: number, j: number) =>
      `${((corners[i].x + corners[j].x) / 2).toFixed(1)} ${((corners[i].y + corners[j].y) / 2).toFixed(1)}`;
    const cross = `M${mid(0, 1)} L${mid(3, 2)} M${mid(0, 3)} L${mid(1, 2)}`;
    gridFillRef.current?.setAttribute("d", square);
    gridLineRef.current?.setAttribute("d", `${square} ${cross}`);
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

  function begin(axis: string, action: GizmoAction, ne: PointerEvent) {
    const i = AXES.findIndex((a) => a.key === axis);
    const origin = object.position.clone();

    if (action === "translate") {
      const ax = AXES[i].dir.clone();
      // Drag along the axis on a camera-facing plane that contains it; capture
      // the start param so movement is a pure delta (no jump on grab).
      const viewDir = camera.getWorldDirection(new THREE.Vector3());
      const n = axisDragPlaneNormal(v3(ax), v3(viewDir));
      const ray = ndcRay(ne);
      const s0 = n ? axisDragParam(v3(ray.origin), v3(ray.direction), v3(origin), v3(ax), n) : null;
      drag.current = { mode: "translate", origin, axis: ax, n, s0 };
    } else if (action === "rotate") {
      const ax = AXES[i].dir.clone();
      const { u, v } = basis[i];
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(ax, origin);
      const p = new THREE.Vector3();
      const a0 = ndcRay(ne).intersectPlane(plane, p) ? angleInPlane(p, origin, u, v) : 0;
      drag.current = {
        mode: "rotate",
        origin,
        axis: ax,
        plane,
        u: u.clone(),
        v: v.clone(),
        a0,
        q0: object.quaternion.clone(),
      };
    } else if (action === "planar") {
      // Slide within the coordinate plane the grid is currently drawn in.
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        planeNormal.current.clone(),
        origin,
      );
      const hit0 = new THREE.Vector3();
      ndcRay(ne).intersectPlane(plane, hit0);
      drag.current = { mode: "planar", origin, plane, hit0 };
    } else {
      const s = screenOf(origin);
      const startDist = Math.hypot(ne.clientX - s.x, ne.clientY - s.y);
      drag.current = { mode: "scale", cx: s.x, cy: s.y, startDist: Math.max(1, startDist), s0: object.scale.x };
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
    } else if (d.mode === "planar") {
      const hit = new THREE.Vector3();
      if (ndcRay(e).intersectPlane(d.plane, hit)) {
        object.position.copy(d.origin).add(hit).sub(d.hit0);
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

  const tint = (id: string, base: string) => (hovered === id ? HOT : base);
  const handlers = (axis: string, action: GizmoAction) => {
    const id = hid(axis, action);
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
        begin(axis, action, e.nativeEvent);
      },
      onPointerEnter: () => setHovered(id),
      onPointerLeave: () => {
        if (!drag.current) setHovered(null);
      },
    };
  };

  return (
    <group ref={followRef}>
      <Html center zIndexRange={[8, 8]} style={{ pointerEvents: "none" }}>
        <svg
          width={C * 2}
          height={C * 2}
          style={{ overflow: "visible", display: "block", userSelect: "none" }}
        >
          {/* Rotation arcs (drawn first → arrows sit on top) */}
          {AXES.map((a, i) => {
            const id = hid(a.key, "rotate");
            return (
              <g key={`r-${a.key}`} {...handlers(a.key, "rotate")} style={{ cursor: "grab" }}>
                <path
                  ref={(el) => {
                    arcHitRefs.current[i] = el;
                  }}
                  d=""
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ pointerEvents: "stroke" }}
                />
                <path
                  ref={(el) => {
                    arcVisRefs.current[i] = el;
                  }}
                  d=""
                  fill="none"
                  stroke={tint(id, a.color)}
                  strokeWidth={hovered === id ? 3 : 2}
                  style={{ pointerEvents: "none" }}
                />
              </g>
            );
          })}

          {/* Scale handles: dotted line (opposite side) to a hollow square */}
          {AXES.map((a, i) => {
            const id = hid(a.key, "scale");
            return (
              <g key={`s-${a.key}`} {...handlers(a.key, "scale")} style={{ cursor: "grab" }}>
                <line
                  ref={(el) => {
                    scaleLineRefs.current[i] = el;
                  }}
                  x1={C}
                  y1={C}
                  x2={C}
                  y2={C}
                  stroke={tint(id, a.color)}
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                  style={{ pointerEvents: "none" }}
                />
                <g
                  ref={(el) => {
                    scaleKnobRefs.current[i] = el;
                  }}
                  transform={`translate(${C} ${C})`}
                  style={{ pointerEvents: "auto" }}
                >
                  <circle r={13} fill="transparent" />
                  <rect
                    x={-5.5}
                    y={-5.5}
                    width={11}
                    height={11}
                    rx={1.5}
                    fill="#0b0e16"
                    stroke={tint(id, a.color)}
                    strokeWidth={hovered === id ? 2.5 : 1.75}
                  />
                </g>
              </g>
            );
          })}

          {/* Move arrows (solid, +axis side) */}
          {AXES.map((a, i) => {
            const id = hid(a.key, "translate");
            return (
              <g key={`m-${a.key}`} {...handlers(a.key, "translate")} style={{ cursor: "grab" }}>
                <line
                  ref={(el) => {
                    arrowHitRefs.current[i] = el;
                  }}
                  x1={C}
                  y1={C}
                  x2={C}
                  y2={C}
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ pointerEvents: "stroke" }}
                />
                <line
                  ref={(el) => {
                    arrowLineRefs.current[i] = el;
                  }}
                  x1={C}
                  y1={C}
                  x2={C}
                  y2={C}
                  stroke={tint(id, a.color)}
                  strokeWidth={hovered === id ? 3 : 2.25}
                  strokeLinecap="round"
                  style={{ pointerEvents: "none" }}
                />
                <g
                  ref={(el) => {
                    arrowHeadRefs.current[i] = el;
                  }}
                  transform={`translate(${C} ${C})`}
                >
                  <path d={headPath} fill={tint(id, a.color)} style={{ pointerEvents: "auto" }} />
                </g>
              </g>
            );
          })}

          {/* Move 2D: drags in (and is drawn in) a coordinate plane; the path
              geometry is computed each frame in useFrame. */}
          {(() => {
            const lit = hovered === "planar";
            return (
              <g {...handlers("", "planar")} style={{ cursor: "grab", pointerEvents: "auto" }}>
                <path ref={gridFillRef} d="" fill="transparent" />
                <path
                  ref={gridLineRef}
                  d=""
                  fill="none"
                  stroke={lit ? HOT : "#cfd6e6"}
                  strokeWidth={lit ? 2 : 1.4}
                  strokeLinejoin="round"
                  style={{ pointerEvents: "none" }}
                />
              </g>
            );
          })()}

          {/* centre anchor */}
          <circle
            cx={C}
            cy={C}
            r={4}
            fill="#0b0e16"
            stroke="#cfd6e6"
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        </svg>
      </Html>
    </group>
  );
}
