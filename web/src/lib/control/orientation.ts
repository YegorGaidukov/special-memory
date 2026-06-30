// Phone "magic window" look: turn the absolute DeviceOrientation reading
// (alpha/beta/gamma + screen-orientation angle, all in degrees) into a stable camera
// {yaw, pitch} in radians. The device→camera quaternion is the classic three.js
// `DeviceOrientationControls` recipe (Euler 'YXZ', then -90deg about X so the camera
// looks out the *back* of the phone, then the screen-orientation correction). We then
// reduce that orientation to just the forward direction — yaw about world-up, pitch
// off the horizon — which inherently drops roll, so tilting your head never rolls the
// city horizon (the projector's OrbitControls keeps up = world-up anyway).
//
// Only *relative* changes are used downstream (calibrated against a recenter baseline),
// so the absolute compass zero never has to be trustworthy — but the sign/scale are
// correct 1:1 because they ride the established control's quaternion.
import * as THREE from "three";

export interface YawPitch {
  yaw: number; // radians, about world-up; 0 = the baseline forward
  pitch: number; // radians, off the horizon; + = looking up
}

const DEG = Math.PI / 180;
const ZEE = new THREE.Vector3(0, 0, 1);
const Q_BACK = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90deg about X

// Scratch — this runs every frame on the phone; avoid per-call allocation.
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _screen = new THREE.Quaternion();
const _fwd = new THREE.Vector3();

export function deviceOrientationToYawPitch(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenDeg: number,
): YawPitch {
  _euler.set(betaDeg * DEG, alphaDeg * DEG, -gammaDeg * DEG, "YXZ");
  _quat.setFromEuler(_euler);
  _quat.multiply(Q_BACK);
  _quat.multiply(_screen.setFromAxisAngle(ZEE, -screenDeg * DEG));

  // Camera forward is -Z; rotate it by the device quaternion, then read angles off it.
  _fwd.set(0, 0, -1).applyQuaternion(_quat);
  const yaw = Math.atan2(_fwd.x, -_fwd.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, _fwd.y)));
  return { yaw, pitch };
}
