"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Signal01 } from "@untitledui/icons";
import { joystickVector } from "@/lib/control/input";
import { useControlSocket } from "@/hooks/useControlSocket";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import type { TimeRange } from "@/lib/explore/timeline";
import type { MemoryRecord } from "@/lib/manifest/types";
import Timeline from "./Timeline";
import styles from "./mobile.module.css";

// 5b Navigate: the phone drives the projected view. Two explicit circular pads —
// MOVE (joystick) and LOOK (fallback look stick) — plus a gyro "magic window" toggle
// and a timeline that filters the city by year. Two look modes:
//   • Gyro (default when available): aim the phone to look; MOVE still walks. Absolute `aim`.
//   • Stick: the LOOK pad drives a rate `look`, for phones without/denied motion.
// State is sent ~16 Hz; the projector smooths it. The timeline broadcasts a `filter`.
const SEND_MS = 60;
const MOVE_RADIUS = 70;
const LOOK_RADIUS = 74;

// A pad's joystick origin is the point where the finger first landed (NOT the ring centre),
// so the ring is just a guide for where to place your thumb — deflection starts at zero from
// wherever you touched, and nothing moves until you drag away from that point.
type Pad = { id: number; cx: number; cy: number };

export default function DriveMode({
  records,
  range,
  onRangeChange,
}: {
  records: MemoryRecord[];
  range: TimeRange | null;
  onRangeChange: (r: TimeRange) => void;
}) {
  const { driving, send } = useControlSocket();
  const { status: gyroStatus, enable: enableGyro, disable: disableGyro, read: readAim } =
    useDeviceOrientation();
  const [gyro, setGyro] = useState(false);

  const move = useRef({ x: 0, y: 0 });
  const look = useRef({ x: 0, y: 0 });
  const moveP = useRef<Pad | null>(null);
  const lookP = useRef<Pad | null>(null);
  const requested = useRef(false);
  const pendingRecenter = useRef(false);

  const anyPad = () => moveP.current !== null || lookP.current !== null;

  // Steady state push. Gyro: move + latest absolute aim continuously (look without a
  // finger down); stick: move + look only while a pad is held. Recenter rides the first
  // valid aim after a request.
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
      } else if (anyPad()) {
        send({ type: "state", move: move.current, look: look.current });
      }
    }, SEND_MS);
    return () => clearInterval(t);
  }, [send, gyro, readAim]);

  // Release the driver token when leaving Navigate (mode switch unmounts this surface).
  useEffect(() => {
    return () => send({ type: "release" });
  }, [send]);

  const ensureDriving = () => {
    if (!requested.current) {
      requested.current = true;
      send({ type: "request" });
    }
  };
  const maybeRelease = () => {
    if (!gyro && !anyPad() && requested.current) {
      requested.current = false;
      send({ type: "state", move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
      send({ type: "release" });
    }
  };

  const padDown = (which: "move" | "look") => (e: React.PointerEvent) => {
    if (which === "look" && gyro) return; // gyro owns look
    // Anchor the joystick origin where the finger landed, not the ring centre.
    const pad: Pad = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (which === "move") {
      moveP.current = pad;
    } else {
      lookP.current = pad;
    }
    ensureDriving();
    padMoveHandler(which)(e);
  };
  const padMoveHandler = (which: "move" | "look") => (e: React.PointerEvent) => {
    const p = which === "move" ? moveP.current : lookP.current;
    if (!p || p.id !== e.pointerId) return;
    const radius = which === "move" ? MOVE_RADIUS : LOOK_RADIUS;
    const v = joystickVector(e.clientX - p.cx, e.clientY - p.cy, radius);
    if (which === "move") {
      move.current = { x: v.x, y: -v.y }; // up = forward
    } else {
      look.current = { x: v.x, y: v.y }; // down = look down
    }
  };
  const padUp = (which: "move" | "look") => (e: React.PointerEvent) => {
    if (which === "move" && moveP.current?.id === e.pointerId) {
      moveP.current = null;
      move.current = { x: 0, y: 0 };
    } else if (which === "look" && lookP.current?.id === e.pointerId) {
      lookP.current = null;
      look.current = { x: 0, y: 0 };
    }
    maybeRelease();
  };

  const toggleGyro = async () => {
    if (gyro) {
      setGyro(false);
      disableGyro();
      move.current = { x: 0, y: 0 };
      send({ type: "state", move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
      send({ type: "release" });
      requested.current = false;
    } else if (await enableGyro()) {
      pendingRecenter.current = true; // baseline "forward" on the first reading
      send({ type: "request" });
      requested.current = true;
      setGyro(true);
    }
  };

  // The timeline sets the shared range AND broadcasts a `filter` to the projector.
  const applyRange = useCallback(
    (r: TimeRange) => {
      onRangeChange(r);
      send({ type: "state", move: move.current, look: look.current, filter: r });
    },
    [onRangeChange, send],
  );

  // Quiet by default (like the mock); only surface the states that need a word.
  const status = gyroStatus === "denied" ? "Motion denied — use the look pad" : "";

  const lookDisabled = gyro;

  return (
    <main className={styles.navSurface}>
      {status && <span className={styles.navStatus}>{status}</span>}

      {gyroStatus !== "unsupported" && (
        <button
          type="button"
          className={`${styles.gyroBtn} ${gyro ? styles.gyroBtnActive : ""}`}
          onClick={toggleGyro}
          aria-pressed={gyro}
          aria-label={gyro ? "Gyro look on — tap to use the look pad" : "Enable gyro look"}
        >
          <Signal01 width={30} height={30} aria-hidden />
        </button>
      )}

      <div className={styles.pads}>
        <div className={`${styles.pad} ${lookDisabled ? styles.padDisabled : ""}`}>
          <div
            className={`${styles.padRing} ${lookDisabled ? styles.padRingDashed : ""}`}
            onPointerDown={padDown("look")}
            onPointerMove={padMoveHandler("look")}
            onPointerUp={padUp("look")}
            onPointerCancel={padUp("look")}
          />
          <span className={styles.padLabel}>LOOK</span>
        </div>

        <div className={styles.pad}>
          <div
            className={`${styles.padRing} ${styles.padRingMove}`}
            onPointerDown={padDown("move")}
            onPointerMove={padMoveHandler("move")}
            onPointerUp={padUp("move")}
            onPointerCancel={padUp("move")}
          />
          <span className={styles.padLabel}>MOVE</span>
        </div>
      </div>

      <Timeline records={records} range={range} onChange={applyRange} />
    </main>
  );
}
