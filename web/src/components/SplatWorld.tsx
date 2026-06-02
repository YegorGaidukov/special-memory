"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect } from "react";
import { DropInViewer } from "@mkkellogg/gaussian-splats-3d";
import { MEMORIES_BASE_URL } from "@/config/explorer";
import { resolveAssetUrl } from "@/lib/manifest/url";

// Step 4: render a single, hard-coded splat to prove the renderer + R3F + Next
// integration end to end. Multi-splat-from-manifest comes in Step 5.
const SAMPLE_SPLAT = "photo_2026-06-02_21-59-01.ply";

/**
 * Imperatively own one DropInViewer and drop it into the R3F scene. A fresh
 * viewer is created per mount (and disposed on unmount), so React StrictMode's
 * double-mount in dev never adds a scene to an already-disposed viewer.
 */
function SplatLayer({ url }: { url: string }) {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const viewer = new DropInViewer({ sharedMemoryForWorkers: true });
    scene.add(viewer);

    const loader = viewer.addSplatScene(url, {
      progressiveLoad: true,
      showLoadingUI: true,
    });
    // Swallow abort-on-unmount rejections; surface real failures.
    Promise.resolve(loader).catch((err) => {
      if (!(err as { aborted?: boolean })?.aborted) {
        console.error("Failed to load splat scene", url, err);
      }
    });

    return () => {
      (loader as { abort?: () => void }).abort?.();
      scene.remove(viewer);
      viewer.dispose().catch(() => {});
    };
  }, [scene, url]);

  return null;
}

export default function SplatWorld() {
  const url = resolveAssetUrl(MEMORIES_BASE_URL, SAMPLE_SPLAT);

  return (
    <Canvas
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: [0, 0, 8], fov: 60, near: 0.1, far: 2000 }}
    >
      <color attach="background" args={["#05060a"]} />
      <SplatLayer url={url} />
      <OrbitControls makeDefault />
    </Canvas>
  );
}
