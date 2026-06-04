import type { Vec3 } from "@/lib/manifest/types";

export interface CameraPose {
  position: Vec3;
  forward: Vec3;
}

// Module-level mutable bridge between the WebGL camera (inside the R3F Canvas)
// and the DOM drop handler (outside it). CameraPoseProbe writes every frame; the
// drop handler reads on drop so a GPS-less memory lands in front of the view.
let current: CameraPose = { position: [0, 0, 0], forward: [0, 0, -1] };

export function setCameraPose(pose: CameraPose): void {
  current = pose;
}

export function getCameraPose(): CameraPose {
  return current;
}
