"use client";

import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";
import { memoryAtPointer } from "@/lib/camera/pickAtPointer";
import { framePoseForRecord } from "@/lib/camera/frame";
import { makeFlyTo, type FlySample } from "@/lib/camera/flyTo";
import { FLY_TO_DURATION_MS, FLY_TO_STANDOFF } from "@/config/explorer";

// Fly-mode travel: double-click a memory to glide to it. Navigation owns the
// camera controls (orbit + WASD); this only animates the camera during a fly-to,
// suspending the controls while it runs and handing them back (pivoting on the
// arrived memory) when it finishes. Renders nothing.
const MOVE_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

type OrbitLike = { enabled: boolean; target: THREE.Vector3; update?: () => void };

export default function Travel({
  records,
  onArrive,
}: {
  records: MemoryRecord[];
  onArrive?: (record: MemoryRecord) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as OrbitLike | null;

  const fly = useRef<((elapsedMs: number) => FlySample) | null>(null);
  const flyElapsed = useRef(0);
  const flyTarget = useRef<MemoryRecord | null>(null);

  // Read latest values inside listeners without re-binding them.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  useEffect(() => {
    const canvas = gl.domElement;

    // Abandon an in-progress flight and hand control back to the user.
    const cancel = () => {
      if (!fly.current) return;
      fly.current = null;
      const c = controlsRef.current;
      if (c) c.enabled = true;
    };

    const onDblClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const id = memoryAtPointer(recordsRef.current, ndc, camera);
      const hit = id ? recordsRef.current.find((r) => r.id === id) : null;
      if (!hit) return;

      const origin: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const from = {
        position: origin,
        lookAt: [origin[0] + dir.x * 10, origin[1] + dir.y * 10, origin[2] + dir.z * 10] as Vec3,
      };
      const to = framePoseForRecord(hit, origin, FLY_TO_STANDOFF);
      fly.current = makeFlyTo(from, to, FLY_TO_DURATION_MS);
      flyElapsed.current = 0;
      flyTarget.current = hit;
      const c = controlsRef.current;
      if (c) c.enabled = false; // suspend orbit + WASD for the duration of the flight
    };

    // Any deliberate user input (grabbing orbit, or starting to fly manually)
    // cancels an active travel.
    const onPointerDown = () => cancel();
    const onKeyDown = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) cancel();
    };

    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    if (!fly.current) return;
    flyElapsed.current += delta * 1000;
    const s = fly.current(flyElapsed.current);
    camera.position.set(s.position[0], s.position[1], s.position[2]);
    camera.lookAt(s.lookAt[0], s.lookAt[1], s.lookAt[2]);
    if (!s.done) return;

    const arrived = flyTarget.current;
    fly.current = null;
    const c = controlsRef.current;
    if (c && arrived) {
      // Pivot the orbit on the memory we just flew to, then hand controls back.
      const p = arrived.transform.position;
      c.target.set(p[0], p[1], p[2]);
      c.enabled = true;
      c.update?.();
    }
    if (arrived) onArriveRef.current?.(arrived);
  });

  return null;
}
