"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { useManifest } from "@/hooks/useManifest";
import FreeFly from "@/components/FreeFly";
import Memories from "@/components/Memories";
import TravelOverlay from "@/components/TravelOverlay";
import type { MemoryRecord } from "@/lib/manifest/types";

// Stable empty list so FreeFly's effects don't re-bind before the manifest loads.
const EMPTY: MemoryRecord[] = [];

function ContextLossLogger() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const onLost = () => console.warn("[explorer] WebGL context lost");
    gl.domElement.addEventListener("webglcontextlost", onLost);
    return () => gl.domElement.removeEventListener("webglcontextlost", onLost);
  }, [gl]);
  return null;
}

function Crosshair() {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        width: 6,
        height: 6,
        marginLeft: -3,
        marginTop: -3,
        borderRadius: "50%",
        background: "rgba(230,233,240,0.5)",
        pointerEvents: "none",
      }}
    />
  );
}

export default function SplatWorld() {
  const m = useManifest();
  const [current, setCurrent] = useState<MemoryRecord | null>(null);
  const records = m.status === "ready" ? m.manifest.memories : EMPTY;

  return (
    <>
      <Canvas
        style={{ position: "fixed", inset: 0 }}
        camera={{ position: [0, 12, 70], fov: 60, near: 0.1, far: 3000 }}
      >
        <color attach="background" args={["#05060a"]} />
        <ContextLossLogger />
        {m.status === "ready" && <Memories records={m.manifest.memories} />}
        <FreeFly records={records} speed={25} onArrive={setCurrent} />
      </Canvas>
      <Crosshair />
      <TravelOverlay
        status={m.status}
        count={records.length}
        error={m.status === "error" ? m.error : undefined}
        current={current}
      />
    </>
  );
}
