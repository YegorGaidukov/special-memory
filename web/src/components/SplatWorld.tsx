"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import { DropInViewer } from "@mkkellogg/gaussian-splats-3d";
import { MEMORIES_BASE_URL } from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";
import { toSplatSceneArgs } from "@/lib/transform/apply";
import type { MemoryRecord } from "@/lib/manifest/types";

// Step 4: render a single splat (upright) to prove renderer + R3F + Next work
// end to end. Step 5 replaces this hard-coded record with the parsed manifest.
const SAMPLE: MemoryRecord = {
  id: "sample",
  status: "approved",
  thumbnail_url: "photo_2026-06-02_21-59-01.jpg",
  splat_url: "photo_2026-06-02_21-59-01.ply",
  transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
};

function SplatLayer({
  record,
  onLoaded,
}: {
  record: MemoryRecord;
  onLoaded: () => void;
}) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  // A lost context blanks the canvas; log it rather than fail silently.
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = () => console.warn("[explorer] WebGL context lost");
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl]);

  useEffect(() => {
    const viewer = new DropInViewer({ sharedMemoryForWorkers: true });
    scene.add(viewer);

    const { position, rotation, scale } = toSplatSceneArgs(record);
    const url = resolveAssetUrl(MEMORIES_BASE_URL, record.splat_url);
    const loader = viewer.addSplatScene(url, {
      position,
      rotation,
      scale,
      progressiveLoad: true,
      showLoadingUI: false,
    });
    Promise.resolve(loader)
      .then(onLoaded)
      .catch((err) => {
        const e = err as { aborted?: boolean; name?: string };
        if (e?.aborted || e?.name === "AbortError") return; // unmount race
        console.error("[explorer] failed to load splat", url, err);
      });

    return () => {
      (loader as { abort?: () => void }).abort?.();
      scene.remove(viewer);
      viewer.dispose().catch(() => {});
    };
  }, [scene, record, onLoaded]);

  return null;
}

export default function SplatWorld() {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <Canvas
        style={{ position: "fixed", inset: 0 }}
        camera={{ position: [0, 0, 8], fov: 60, near: 0.1, far: 2000 }}
      >
        <color attach="background" args={["#05060a"]} />
        <SplatLayer record={SAMPLE} onLoaded={() => setLoaded(true)} />
        <OrbitControls makeDefault />
      </Canvas>
      {!loaded && (
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
          Loading memory…
        </div>
      )}
    </>
  );
}
