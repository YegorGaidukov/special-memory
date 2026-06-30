"use client";

import { useEffect, useRef } from "react";
import { joystickVector } from "@/lib/control/input";
import { useControlSocket } from "@/hooks/useControlSocket";
import styles from "./mobile.module.css";

// The phone becomes a joystick for the projected view. Left half of the screen is a
// move stick (drag from where you touch); the right half is drag-to-look. Both work
// at once (two fingers). State is sent ~16 Hz while touched; the projector integrates
// the held vector, so motion stays smooth. "Jump to a memory" flies to a random one.
const SEND_MS = 60;
const MOVE_RADIUS = 70;
const LOOK_RADIUS = 120;

type Track = { id: number; ox: number; oy: number };

export default function DriveMode({ onBack }: { onBack: () => void }) {
  const { connected, driving, send } = useControlSocket();
  const move = useRef({ x: 0, y: 0 });
  const look = useRef({ x: 0, y: 0 });
  const moveTouch = useRef<Track | null>(null);
  const lookTouch = useRef<Track | null>(null);
  const active = useRef(false);

  // Push the held vector at a steady rate while any finger is down.
  useEffect(() => {
    const t = setInterval(() => {
      if (active.current) send({ type: "state", move: move.current, look: look.current });
    }, SEND_MS);
    return () => clearInterval(t);
  }, [send]);

  const anyActive = () => moveTouch.current !== null || lookTouch.current !== null;

  const onStart = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const leftHalf = t.clientX < window.innerWidth / 2;
      if (leftHalf && !moveTouch.current) {
        moveTouch.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
      } else if (!lookTouch.current) {
        lookTouch.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
      }
    }
    if (anyActive() && !active.current) {
      active.current = true;
      send({ type: "request" });
    }
  };

  const onMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const m = moveTouch.current;
      const l = lookTouch.current;
      if (m && t.identifier === m.id) {
        const v = joystickVector(t.clientX - m.ox, t.clientY - m.oy, MOVE_RADIUS);
        move.current = { x: v.x, y: -v.y }; // drag up = forward
      } else if (l && t.identifier === l.id) {
        const v = joystickVector(t.clientX - l.ox, t.clientY - l.oy, LOOK_RADIUS);
        look.current = { x: v.x, y: v.y }; // drag down = look down
      }
    }
  };

  const onEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (moveTouch.current && t.identifier === moveTouch.current.id) {
        moveTouch.current = null;
        move.current = { x: 0, y: 0 };
      }
      if (lookTouch.current && t.identifier === lookTouch.current.id) {
        lookTouch.current = null;
        look.current = { x: 0, y: 0 };
      }
    }
    if (!anyActive() && active.current) {
      active.current = false;
      send({ type: "state", move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
      send({ type: "release" });
    }
  };

  return (
    <main
      className={styles.driveSurface}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
    >
      <div className={styles.driveHud}>
        <button className={styles.driveBtn} onClick={onBack}>
          ← Add
        </button>
        <span className={styles.driveStatus}>
          {!connected ? "Connecting…" : driving ? "You’re driving" : "Drag to drive"}
        </span>
        <button
          className={styles.driveBtn}
          onClick={() => send({ type: "state", move: move.current, look: look.current, jump: "random" })}
        >
          Jump to a memory
        </button>
      </div>
      <div className={styles.driveHints}>
        <span>move</span>
        <span>look</span>
      </div>
    </main>
  );
}
