"use client";

import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Mouse-look (pointer lock) + WASD movement that follows the view direction:
// W flies wherever you're looking (including up/down via pitch), S reverses,
// A/D strafe horizontally. No separate up/down keys, no roll, no drag-to-look.
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

export default function FreeFly({ speed = 25 }: { speed?: number }) {
  const camera = useThree((s) => s.camera);
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (MOVE[e.code]) pressed.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code);
    const clear = () => pressed.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear); // avoid keys sticking on focus loss
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame((_, delta) => {
    if (pressed.current.size === 0) return;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward); // full 3D look direction (includes pitch)
    const right = new THREE.Vector3()
      .crossVectors(forward, camera.up)
      .normalize();

    const move = new THREE.Vector3();
    for (const code of pressed.current) {
      const dir = MOVE[code];
      if (dir === "fwd") move.add(forward);
      else if (dir === "back") move.sub(forward);
      else if (dir === "right") move.add(right);
      else if (dir === "left") move.sub(right);
    }
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * delta);
      camera.position.add(move);
    }
  });

  return <PointerLockControls makeDefault />;
}
