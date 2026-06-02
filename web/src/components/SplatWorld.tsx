"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect } from "react";
import { DropInViewer } from "@mkkellogg/gaussian-splats-3d";
import { MEMORIES_BASE_URL } from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import { useManifest } from "@/hooks/useManifest";
import type { MemoryRecord } from "@/lib/manifest/types";

// Step 5: load every memory from the manifest at its stored transform. One
// DropInViewer holds all scenes (Step 8 will make this load/dispose on approach).
function SplatScenes({ records }: { records: MemoryRecord[] }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const onLost = () => console.warn("[explorer] WebGL context lost");
    gl.domElement.addEventListener("webglcontextlost", onLost);
    return () => gl.domElement.removeEventListener("webglcontextlost", onLost);
  }, [gl]);

  useEffect(() => {
    const viewer = new DropInViewer({ sharedMemoryForWorkers: true });
    scene.add(viewer);

    const sceneOptions = records.map((r) => {
      const { position, rotation, scale } = toSplatSceneArgs(r);
      return {
        path: resolveAssetUrl(MEMORIES_BASE_URL, r.splat_url),
        position,
        rotation,
        scale,
      };
    });

    const loader = viewer.addSplatScenes(sceneOptions, false);
    Promise.resolve(loader).catch((err) => {
      const e = err as { aborted?: boolean; name?: string };
      if (e?.aborted || e?.name === "AbortError") return; // unmount race
      console.error("[explorer] failed to load splat scenes", err);
    });

    return () => {
      (loader as { abort?: () => void }).abort?.();
      scene.remove(viewer);
      viewer.dispose().catch(() => {});
    };
  }, [scene, records]);

  return null;
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
        {m.status === "ready" && <SplatScenes records={m.manifest.memories} />}
        <OrbitControls makeDefault />
      </Canvas>
      {m.status === "loading" && <Hud text="Loading memories…" />}
      {m.status === "error" && <Hud text={`Failed to load memories: ${m.error}`} />}
      {m.status === "ready" && (
        <Hud text={`${m.manifest.memories.length} memories — drag to orbit, scroll to zoom`} />
      )}
    </>
  );
}
