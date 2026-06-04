"use client";

import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { setCameraPose } from "@/lib/camera/pose";

// Reused scratch vector — getWorldDirection() needs a target to write into, and
// this runs every frame, so we avoid allocating one per tick (matches the
// allocation discipline of the other useFrame bodies, e.g. Navigation.tsx).
const _fwd = new THREE.Vector3();

// Publishes the live camera world position + forward to the pose bridge each
// frame so the (outside-Canvas) drop handler can place a GPS-less memory ahead
// of the current view. Renders nothing.
export default function CameraPoseProbe() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    camera.getWorldDirection(_fwd);
    setCameraPose({
      position: [camera.position.x, camera.position.y, camera.position.z],
      forward: [_fwd.x, _fwd.y, _fwd.z],
    });
  });
  return null;
}
