"use client";

import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { setCameraPose } from "@/lib/camera/pose";

// Publishes the live camera world position + forward to the pose bridge each
// frame so the (outside-Canvas) drop handler can place a GPS-less memory ahead
// of the current view. Renders nothing.
export default function CameraPoseProbe() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    setCameraPose({
      position: [camera.position.x, camera.position.y, camera.position.z],
      forward: [f.x, f.y, f.z],
    });
  });
  return null;
}
