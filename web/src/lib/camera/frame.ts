import type { MemoryRecord, Vec3 } from "@/lib/manifest/types";
import type { Pose } from "./types";

/**
 * Camera pose that frames a memory: positioned `standoff` units from the
 * memory along the current approach direction (from `fromPosition`), looking at
 * the memory. Orientation-agnostic — you fly toward it from wherever you are.
 * Falls back to +Z if the camera is already on top of the memory.
 */
export function framePoseForRecord(
  record: MemoryRecord,
  fromPosition: Vec3,
  standoff: number,
): Pose {
  const target = record.transform.position;
  const dir: Vec3 = [
    fromPosition[0] - target[0],
    fromPosition[1] - target[1],
    fromPosition[2] - target[2],
  ];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const unit: Vec3 =
    len < 1e-6 ? [0, 0, 1] : [dir[0] / len, dir[1] / len, dir[2] / len];
  return {
    position: [
      target[0] + unit[0] * standoff,
      target[1] + unit[1] * standoff,
      target[2] + unit[2] * standoff,
    ],
    lookAt: target,
  };
}
