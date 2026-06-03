"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FLY } from "@/config/explorer";

// Shared navigation for both the public fly-through and the curator edit mode:
// drei OrbitControls (left-drag to look/orbit, right-drag to pan, scroll to zoom)
// plus WASD keyboard flight in the direction the camera is looking. WASD moves
// the camera AND the orbit target by the same vector, so the orbit pivot follows
// you and OrbitControls' own update never fights the flight.
const MOVE: Record<string, "fwd" | "back" | "left" | "right"> = {
  KeyW: "fwd",
  ArrowUp: "fwd",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

// Don't fly the camera while the user is typing in a field (e.g. the inspector's
// numeric position/heading/scale inputs).
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return (
    !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
  );
}

type OrbitLike = { enabled: boolean; target: THREE.Vector3 };

export default function Navigation() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const pressed = useRef<Set<string>>(new Set());
  const boosting = useRef(false);

  // Pivot the orbit around a point ahead of the camera (not the world origin, which
  // would snap the view there). Computed once at mount, on the current line of
  // sight, so the first frame is a no-op.
  const initialTarget = useMemo(() => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return camera.position.clone().addScaledVector(dir, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.key === "Shift") boosting.current = true;
      if (MOVE[e.code]) pressed.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") boosting.current = false;
      pressed.current.delete(e.code);
    };
    const clear = () => {
      pressed.current.clear();
      boosting.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame((_, delta) => {
    if (pressed.current.size === 0) return;
    // Pause flight while controls are suspended — the gizmo disables them during a
    // drag, and Travel disables them during a fly-to.
    if (controls && controls.enabled === false) return;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    const move = new THREE.Vector3();
    for (const code of pressed.current) {
      const dir = MOVE[code];
      if (dir === "fwd") move.add(forward);
      else if (dir === "back") move.sub(forward);
      else if (dir === "right") move.add(right);
      else if (dir === "left") move.sub(right);
    }
    if (move.lengthSq() > 0) {
      const v = boosting.current ? FLY.baseSpeed * FLY.boost : FLY.baseSpeed;
      move.normalize().multiplyScalar(v * delta);
      camera.position.add(move);
      controls?.target.add(move); // keep the orbit pivot in front of the camera
    }
  });

  return <OrbitControls makeDefault target={initialTarget} />;
}
