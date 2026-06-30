"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deviceOrientationToYawPitch, type YawPitch } from "@/lib/control/orientation";

// Phone gyroscope "magic window" look. The untestable sensor seam: it owns the
// DeviceOrientation listener, the iOS 13+ permission prompt (which must fire from a user
// gesture over HTTPS), and a watchdog that gives up if the device exposes the event but
// never fires it (desktops). The pure angle math lives in lib/control/orientation.ts.
export type GyroStatus = "unsupported" | "idle" | "denied" | "active";

export interface DeviceOrientationApi {
  status: GyroStatus;
  enable: () => Promise<boolean>; // request permission + attach; resolves to success
  disable: () => void; // detach + return to idle
  read: () => YawPitch | null; // latest aim, or null until the first reading
}

function screenAngle(): number {
  if (typeof screen !== "undefined" && screen.orientation && typeof screen.orientation.angle === "number") {
    return screen.orientation.angle;
  }
  // Legacy iOS Safari.
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}

export function useDeviceOrientation(): DeviceOrientationApi {
  const supported =
    typeof window !== "undefined" && typeof window.DeviceOrientationEvent !== "undefined";
  const [status, setStatus] = useState<GyroStatus>(supported ? "idle" : "unsupported");
  const aim = useRef<YawPitch | null>(null);
  const handler = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detach = useCallback(() => {
    if (handler.current) {
      window.removeEventListener("deviceorientation", handler.current);
      handler.current = null;
    }
    if (watchdog.current) {
      clearTimeout(watchdog.current);
      watchdog.current = null;
    }
    aim.current = null;
  }, []);

  const attach = useCallback(() => {
    let gotData = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha === null && e.beta === null && e.gamma === null) return;
      gotData = true;
      aim.current = deviceOrientationToYawPitch(e.alpha ?? 0, e.beta ?? 0, e.gamma ?? 0, screenAngle());
    };
    handler.current = onOrient;
    window.addEventListener("deviceorientation", onOrient);
    setStatus("active");
    // The event exists on desktops but never fires there — fall back to the stick.
    watchdog.current = setTimeout(() => {
      if (!gotData) {
        detach();
        setStatus("unsupported");
      }
    }, 1500);
  }, [detach]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setStatus("unsupported");
      return false;
    }
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<PermissionState | "granted" | "denied">;
    };
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setStatus("denied");
          return false;
        }
      } catch {
        setStatus("denied");
        return false;
      }
    }
    attach();
    return true;
  }, [supported, attach]);

  const disable = useCallback(() => {
    detach();
    setStatus(supported ? "idle" : "unsupported");
  }, [detach, supported]);

  useEffect(() => detach, [detach]); // detach on unmount

  const read = useCallback(() => aim.current, []);
  return { status, enable, disable, read };
}
