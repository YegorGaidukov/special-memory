"use client";

import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";
import { pickMemory } from "@/lib/camera/pick";
import { framePoseForRecord } from "@/lib/camera/frame";
import { makeFlyTo, type FlySample } from "@/lib/camera/flyTo";
import { FLY_TO_DURATION_MS, FLY_TO_STANDOFF, PICK } from "@/config/explorer";

// Mouse-look (pointer lock) + WASD movement that follows the view direction.
// Click while locked to travel to the memory you're aiming at; pressing a
// movement key cancels an in-progress travel.
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

export default function FreeFly({
  records,
  speed = 25,
}: {
  records: MemoryRecord[];
  speed?: number;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pressed = useRef<Set<string>>(new Set());

  // Active travel: an eased fly-to function + elapsed time, or null when free.
  const fly = useRef<((elapsedMs: number) => FlySample) | null>(null);
  const flyElapsed = useRef(0);

  // Keep the latest records in a ref so the click handler isn't re-bound often.
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (MOVE[e.code]) {
        pressed.current.add(e.code);
        fly.current = null; // user takes manual control -> cancel travel
      }
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code);
    const clear = () => pressed.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useEffect(() => {
    const onClick = () => {
      // Ignore the click that engages pointer lock; only travel while locked.
      if (document.pointerLockElement == null) return;

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const viewDir: Vec3 = [dir.x, dir.y, dir.z];

      const hit = pickMemory(recordsRef.current, origin, viewDir, {
        maxAngleRad: PICK.maxAngleRad,
        maxDist: PICK.maxDist,
      });
      if (!hit) return;

      const from = {
        position: origin,
        lookAt: [
          origin[0] + viewDir[0] * 10,
          origin[1] + viewDir[1] * 10,
          origin[2] + viewDir[2] * 10,
        ] as Vec3,
      };
      const to = framePoseForRecord(hit, origin, FLY_TO_STANDOFF);
      fly.current = makeFlyTo(from, to, FLY_TO_DURATION_MS);
      flyElapsed.current = 0;
    };

    const canvas = gl.domElement;
    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [camera, gl]);

  useFrame((_, delta) => {
    // Travel overrides manual flight while active.
    if (fly.current) {
      flyElapsed.current += delta * 1000;
      const s = fly.current(flyElapsed.current);
      camera.position.set(s.position[0], s.position[1], s.position[2]);
      camera.lookAt(s.lookAt[0], s.lookAt[1], s.lookAt[2]);
      if (s.done) fly.current = null;
      return;
    }

    if (pressed.current.size === 0) return;
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
      move.normalize().multiplyScalar(speed * delta);
      camera.position.add(move);
    }
  });

  return <PointerLockControls makeDefault />;
}
