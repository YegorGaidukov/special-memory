// Add-screen upload phases. "sending" already shows the calm "Memory added" screen
// (optimistic — the POST body is still uploading over WiFi); "settled" means the POST
// succeeded, and only then may the screen advance to Explore (tap or timer), so a
// failed upload can never be silently skipped past.
export type AddPhase = "idle" | "sending" | "settled" | "error";
export type AddEvent = "submit" | "succeed" | "fail";

const TRANSITIONS: Record<AddPhase, Partial<Record<AddEvent, AddPhase>>> = {
  idle: { submit: "sending" },
  sending: { succeed: "settled", fail: "error" },
  settled: {},
  error: { submit: "sending" },
};

export function advance(phase: AddPhase, event: AddEvent): AddPhase {
  return TRANSITIONS[phase][event] ?? phase;
}

/** The "Memory added" screen shows for both in-flight and settled uploads. */
export function showsAdded(phase: AddPhase): boolean {
  return phase === "sending" || phase === "settled";
}

/** Advancing to Explore is armed only once the POST succeeded. */
export function mayAdvance(phase: AddPhase): boolean {
  return phase === "settled";
}
