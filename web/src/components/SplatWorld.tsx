"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useManifest } from "@/hooks/useManifest";
import FreeFly from "@/components/FreeFly";
import Memories from "@/components/Memories";
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

function Hud({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        color: "#7a8499",
        font: "13px system-ui, sans-serif",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}

export default function SplatWorld() {
  const m = useManifest();

  return (
    <>
      <Canvas
        style={{ position: "fixed", inset: 0 }}
        camera={{ position: [0, 12, 70], fov: 60, near: 0.1, far: 3000 }}
      >
        <color attach="background" args={["#05060a"]} />
        <ContextLossLogger />
        {m.status === "ready" && <Memories records={m.manifest.memories} />}
        <FreeFly records={m.status === "ready" ? m.manifest.memories : EMPTY} speed={25} />
      </Canvas>
      <Crosshair />
      {m.status === "loading" && <Hud text="Loading memories…" />}
      {m.status === "error" && <Hud text={`Failed to load memories: ${m.error}`} />}
      {m.status === "ready" && (
        <Hud text={`${m.manifest.memories.length} memories · click to look · WASD to fly · aim + click a memory to travel · Esc to release`} />
      )}
    </>
  );
}
