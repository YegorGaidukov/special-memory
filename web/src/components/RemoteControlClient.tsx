"use client";

import { useEffect } from "react";
import { getWebSocketUrl } from "@/lib/api/baseUrl";
import { setRemoteControl, resetRemoteControl } from "@/lib/control/remoteInput";

// Projector side of the joystick: subscribes to the backend control stream as the
// "display", writes the current driver's held vector into the remote-input bridge
// (read by Navigation each frame), and forwards a "jump" event to onJump. Reconnects
// if the socket drops. DOM-side (no Canvas); mounted once on the explorer.
export default function RemoteControlClient({
  onJump,
}: {
  onJump: (target: string) => void;
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
              driver: !!msg.driver,
            });
          } else if (msg.type === "jump" && typeof msg.target === "string") {
            onJump(msg.target);
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
  }, [onJump]);

  return null;
}
