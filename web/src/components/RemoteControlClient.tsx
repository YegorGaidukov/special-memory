"use client";

import { useEffect } from "react";
import { getWebSocketUrl } from "@/lib/api/baseUrl";
import { setRemoteControl, resetRemoteControl, bumpRecenter } from "@/lib/control/remoteInput";

// Projector side of the joystick: subscribes to the backend control stream as the
// "display", writes the current driver's held vector into the remote-input bridge
// (read by Navigation each frame), and forwards a "jump" event to onJump. Reconnects
// if the socket drops. DOM-side (no Canvas); mounted once on the explorer.
export default function RemoteControlClient({
  onJump,
  onFilter,
  onPlace,
}: {
  onJump: (target: string) => void;
  /** A timeline year-range from the phone: show only memories captured within it. */
  onFilter?: (from: number, to: number) => void;
  /** A memory-move from the phone Explore field: slide memory `id` to world x/z. */
  onPlace?: (id: string, x: number, z: number) => void;
}) {
  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(getWebSocketUrl("/ws/control?role=display"));
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "control") {
            setRemoteControl({
              move: msg.move ?? { x: 0, y: 0 },
              look: msg.look ?? { x: 0, y: 0 },
              aim: msg.aim ?? null,
              driver: !!msg.driver,
            });
          } else if (msg.type === "jump" && typeof msg.target === "string") {
            onJump(msg.target);
          } else if (msg.type === "recenter") {
            bumpRecenter();
          } else if (
            msg.type === "filter" &&
            typeof msg.from === "number" &&
            typeof msg.to === "number"
          ) {
            onFilter?.(msg.from, msg.to);
          } else if (
            msg.type === "place" &&
            typeof msg.id === "string" &&
            typeof msg.x === "number" &&
            typeof msg.z === "number"
          ) {
            onPlace?.(msg.id, msg.x, msg.z);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        resetRemoteControl();
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      resetRemoteControl();
      ws?.close();
    };
  }, [onJump, onFilter, onPlace]);

  return null;
}
