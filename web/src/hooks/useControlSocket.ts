"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWebSocketUrl } from "@/lib/api/baseUrl";

// Phone side of the joystick: a controller WebSocket to the backend. Sends
// request/release/state messages (via the stable `send`) and tracks whether this
// phone currently holds the single driver token (from the server's status replies).
export interface ControlSocket {
  connected: boolean;
  driving: boolean;
  /** Server refused control because this phone isn't at the installation (presence gate). */
  blockedRemote: boolean;
  send: (msg: object) => void;
}

export function useControlSocket(): ControlSocket {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [driving, setDriving] = useState(false);
  const [blockedRemote, setBlockedRemote] = useState(false);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const uuid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Math.random()).slice(2);
    const clientId = uuid.slice(0, 12);

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(
        getWebSocketUrl(`/ws/control?role=controller&clientId=${clientId}`),
      );
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "status") {
            setDriving(!!m.driving);
            setBlockedRemote(m.reason === "remote");
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        setDriving(false);
        setBlockedRemote(false);
        wsRef.current = null;
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { connected, driving, blockedRemote, send };
}
