"use client";

import { TransformControls } from "@react-three/drei";
import { useRef } from "react";
import type * as THREE from "three";

export type GizmoMode = "translate" | "rotate" | "scale";

/**
 * A drei TransformControls gizmo bound to a Spark SplatMesh (any Object3D).
 * Mutating an object's position/quaternion/scale is exactly how Memories.tsx
 * places splats, so this is a supported edit path. drei auto-suspends the
 * `makeDefault` camera controls while a handle is dragged.
 *
 * Scale is kept UNIFORM: drei's scale mode exposes per-axis handles, so on every
 * drag tick we collapse the three axes back to a single value — whichever handle
 * the user grabbed (the axis that diverged most from the drag-start size) drives
 * it. The record stores a scalar; SHARP splats are metric, so one value suffices.
 */
export default function SplatGizmo({
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
  // Uniform scale captured when a scale drag begins, so per-axis handle motion
  // can be collapsed back to one value relative to it.
  const dragStartScale = useRef(1);

  const handleMouseDown = () => {
    if (mode === "scale") dragStartScale.current = object.scale.x;
    onDraggingChanged?.(true);
  };

  const handleObjectChange = () => {
    if (mode === "scale") {
      const s = object.scale;
      const base = dragStartScale.current;
      const dx = Math.abs(s.x - base);
      const dy = Math.abs(s.y - base);
      const dz = Math.abs(s.z - base);
      const next = dx >= dy && dx >= dz ? s.x : dy >= dz ? s.y : s.z;
      object.scale.setScalar(next);
    }
    onObjectChange?.();
  };

  return (
    <TransformControls
      object={object}
      mode={mode}
      space="world"
      onMouseDown={handleMouseDown}
      onMouseUp={() => onDraggingChanged?.(false)}
      onObjectChange={handleObjectChange}
    />
  );
}
