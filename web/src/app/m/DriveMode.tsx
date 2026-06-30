"use client";

import { useEffect, useRef, useState } from "react";
import { Move, Phone01, Target04 } from "@untitledui/icons";
import { joystickVector } from "@/lib/control/input";
import { useControlSocket } from "@/hooks/useControlSocket";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import styles from "./mobile.module.css";

// The phone becomes a joystick for the projected view. Two look modes:
//   • Gyro ("magic window") — the default: physically aim the phone to look around;
//     the whole surface is then the move stick. State carries an absolute `aim`.
//   • Stick (fallback) — left half moves, right half drags to look (rate `look`),
//     for phones with no sensor or that deny the iOS motion permission.
// State is sent ~16 Hz; the projector smooths/integrates it. "Jump" flies to a memory.
const SEND_MS = 60;
const MOVE_RADIUS = 70;
const LOOK_RADIUS = 120;

type Track = { id: number; ox: number; oy: number };

export default function DriveMode() {
  const { connected, driving, send } = useControlSocket();
  const { status: gyroStatus, enable: enableGyro, disable: disableGyro, read: readAim } =
    useDeviceOrientation();
  const [gyro, setGyro] = useState(false);
  const move = useRef({ x: 0, y: 0 });
  const look = useRef({ x: 0, y: 0 });
  const moveTouch = useRef<Track | null>(null);
  const lookTouch = useRef<Track | null>(null);
  const active = useRef(false);
  const pendingRecenter = useRef(false);

  // Push state at a steady rate. In gyro mode we send move + the latest absolute aim
  // continuously (so you can look without a finger down); in stick mode only while a
  // finger is held. Recenter rides the first valid aim after a request.
  useEffect(() => {
    const t = setInterval(() => {
      if (gyro) {
        const aim = readAim();
        const msg: Record<string, unknown> = { type: "state", move: move.current };
        if (aim) {
          msg.aim = aim;
          if (pendingRecenter.current) {
            msg.recenter = true;
            pendingRecenter.current = false;
          }
        }
        send(msg);
      } else if (active.current) {
        send({ type: "state", move: move.current, look: look.current });
      }
    }, SEND_MS);
    return () => clearInterval(t);
  }, [send, gyro, readAim]);

  // Release the driver token when leaving Drive (mode switch unmounts this surface).
  useEffect(() => {
    return () => send({ type: "release" });
  }, [send]);

  const anyActive = () => moveTouch.current !== null || lookTouch.current !== null;

  const onStart = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (gyro) {
        if (!moveTouch.current) moveTouch.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
      } else {
        const leftHalf = t.clientX < window.innerWidth / 2;
        if (leftHalf && !moveTouch.current) {
          moveTouch.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        } else if (!lookTouch.current) {
          lookTouch.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        }
      }
    }
    if (!gyro && anyActive() && !active.current) {
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
    // In gyro mode the driver is held by the continuous aim stream, not the touch.
    if (!gyro && !anyActive() && active.current) {
      active.current = false;
      send({ type: "state", move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
      send({ type: "release" });
    }
  };

  const toggleGyro = async () => {
    if (gyro) {
      setGyro(false);
      disableGyro();
      move.current = { x: 0, y: 0 };
      send({ type: "state", move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
      send({ type: "release" });
    } else if (await enableGyro()) {
      pendingRecenter.current = true; // baseline "forward" on the first reading
      send({ type: "request" });
      setGyro(true);
    }
    // If enable failed, gyroStatus reflects denied/unsupported and we stay on the stick.
  };

  const status = !connected
    ? "Connecting…"
    : gyroStatus === "denied"
      ? "Motion access denied — using stick"
      : gyro
        ? "Aim with your phone"
        : driving
          ? "You’re driving"
          : "Drag to explore";

  return (
    <main
      className={styles.driveSurface}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
    >
      <div className={styles.driveHints}>
        {gyro ? (
          <span>drag anywhere to move</span>
        ) : (
          <>
            <span>move</span>
            <span>look</span>
          </>
        )}
      </div>
      <div className={styles.driveHud}>
        <span className={styles.driveStatus}>{status}</span>
        <div className={styles.driveActions}>
          {gyroStatus !== "unsupported" && (
            <button
              type="button"
              className={styles.driveIconBtn}
              data-active={gyro ? "" : undefined}
              onClick={toggleGyro}
            >
              {gyro ? <Move width={18} height={18} aria-hidden /> : <Phone01 width={18} height={18} aria-hidden />}
              {gyro ? "Stick" : "Gyro"}
            </button>
          )}
          {gyro && (
            <button
              type="button"
              className={styles.driveIconBtn}
              onClick={() => {
                pendingRecenter.current = true;
              }}
            >
              <Target04 width={18} height={18} aria-hidden />
              Recenter
            </button>
          )}
          <button
            className={styles.driveBtn}
            onClick={() =>
              send({ type: "state", move: move.current, look: look.current, jump: "random" })
            }
          >
            Jump to a memory
          </button>
        </div>
      </div>
    </main>
  );
}
