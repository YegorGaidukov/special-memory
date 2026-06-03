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

/**
 * Conjugate of a quaternion [x,y,z,w] → [-x,-y,-z,w]. For a unit quaternion this
 * is its inverse rotation, so `multiplyQuat(multiplyQuat(q, s), conjugateQuat(s))`
 * returns `q` — the basis for undoing a fixed frame correction (see apply.ts).
 */
export function conjugateQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}
