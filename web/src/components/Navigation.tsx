"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FLY, CONTROL } from "@/config/explorer";
import { getRemoteControl, getRecenterCount } from "@/lib/control/remoteInput";
import { applyExpo } from "@/lib/control/input";
import {
  desiredCameraAngles,
  approachAngle,
  anglesToForward,
  forwardToAngles,
  type Calibration,
} from "@/lib/control/aim";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const EPS = 0.001;

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
  // Magic-window (phone gyro) look state: the recenter baseline, the last recenter
  // event seen, and the previous driver flag (to re-baseline on taking the wheel).
  const cal = useRef<Calibration | null>(null);
  const lastRecenter = useRef(0);
  const wasDriving = useRef(false);

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
    // Pause flight while controls are suspended — the gizmo disables them during a
    // drag, and Travel disables them during a fly-to.
    if (controls && controls.enabled === false) return;

    // Keyboard (local) + remote phone joystick (one driver) drive the same loop.
    const rc = getRemoteControl();
    const hasAim = rc.aim !== null;
    // Drop the magic-window baseline when gyro look ends (rate stick or no driver), so
    // the next gyro session re-baselines against the live heading instead of snapping.
    if (!hasAim || !rc.driver) cal.current = null;

    const hasKeys = pressed.current.size > 0;
    const hasRemoteMove = Math.abs(rc.move.x) > EPS || Math.abs(rc.move.y) > EPS;
    const hasRemoteLook = Math.abs(rc.look.x) > EPS || Math.abs(rc.look.y) > EPS;
    if (!hasKeys && !hasRemoteMove && !hasRemoteLook && !hasAim) {
      wasDriving.current = rc.driver;
      return;
    }

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    // Look: absolute "magic window" aim (phone gyro) takes precedence over the rate
    // stick. We ease the orbit target's direction toward the calibrated phone heading;
    // OrbitControls (up = world-up) re-aims the camera, so head-roll never tilts the city.
    if (hasAim && controls && rc.aim) {
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
      const dist = dir.length() || 20;
      const cur = forwardToAngles(dir.x / dist, dir.y / dist, dir.z / dist);

      const recenter = getRecenterCount();
      if (!cal.current || recenter !== lastRecenter.current || (rc.driver && !wasDriving.current)) {
        cal.current = {
          phoneYaw: rc.aim.yaw,
          phonePitch: rc.aim.pitch,
          camYaw: cur.yaw,
          camPitch: cur.pitch,
        };
        lastRecenter.current = recenter;
      }

      const want = desiredCameraAngles(rc.aim, cal.current);
      const yaw = approachAngle(cur.yaw, want.yaw, delta, CONTROL.aimTau);
      const pitch = approachAngle(cur.pitch, want.pitch, delta, CONTROL.aimTau);
      const f = anglesToForward(yaw, pitch);
      controls.target.set(
        camera.position.x + f.x * dist,
        camera.position.y + f.y * dist,
        camera.position.z + f.z * dist,
      );
    } else if (hasRemoteLook && controls) {
      // Rate stick fallback: rotate the orbit target around the camera (yaw about
      // world-up, then pitch about the right axis, clamped near the poles).
      const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
      // Expo response: gentle near centre, full speed at full deflection.
      dir.applyAxisAngle(WORLD_UP, -applyExpo(rc.look.x, CONTROL.lookExpo) * CONTROL.lookYaw * delta);
      const lookRight = new THREE.Vector3().crossVectors(dir, WORLD_UP).normalize();
      const horiz = Math.hypot(dir.x, dir.z);
      const pitch = Math.atan2(dir.y, horiz);
      const wanted = pitch + -applyExpo(rc.look.y, CONTROL.lookExpo) * CONTROL.lookPitch * delta;
      const clamped = Math.max(-1.45, Math.min(1.45, wanted)); // ~±83°, avoid flip
      dir.applyAxisAngle(lookRight, clamped - pitch);
      controls.target.copy(camera.position).add(dir);
    }

    wasDriving.current = rc.driver;

    // Move: WASD unit dirs + analog remote stick, summed; speed scales with stick
    // magnitude (capped at 1) so partial deflection flies slower.
    const move = new THREE.Vector3();
    for (const code of pressed.current) {
      const dir = MOVE[code];
      if (dir === "fwd") move.add(forward);
      else if (dir === "back") move.sub(forward);
      else if (dir === "right") move.add(right);
      else if (dir === "left") move.sub(right);
    }
    move.addScaledVector(forward, rc.move.y);
    move.addScaledVector(right, rc.move.x);

    const len = Math.min(move.length(), 1);
    if (len > EPS) {
      const v = boosting.current ? FLY.baseSpeed * FLY.boost : FLY.baseSpeed;
      move.normalize().multiplyScalar(v * delta * len);
      camera.position.add(move);
      controls?.target.add(move); // keep the orbit pivot in front of the camera
    }
  });

  return <OrbitControls makeDefault target={initialTarget} />;
}
