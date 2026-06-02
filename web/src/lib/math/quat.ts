import type { Quat } from "@/lib/manifest/types";

/**
 * Hamilton product of two quaternions [x,y,z,w]. Matches THREE.Quaternion's
 * `a.multiply(b)`: the result applies `b` first, then `a`, to a vector.
 */
export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
