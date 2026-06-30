// Module-level bridge from the projector's control WebSocket (DOM side) to the R3F
// Navigation frame loop (Canvas side) — mirrors lib/camera/pose.ts. The WS client
// writes the current driver's held vector here; Navigation reads it each frame and
// integrates it, so motion stays smooth between the ~15-20 Hz updates.

export interface RemoteControlState {
  move: { x: number; y: number }; // x = strafe, y = forward (+forward)
  look: { x: number; y: number }; // x = yaw rate, y = pitch rate (+down)
  driver: boolean; // is anyone currently driving?
}

const ZERO: RemoteControlState = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, driver: false };

let current: RemoteControlState = ZERO;

export function setRemoteControl(state: RemoteControlState): void {
  current = state;
}

export function getRemoteControl(): RemoteControlState {
  return current;
}

export function resetRemoteControl(): void {
  current = ZERO;
}
