"use client";

import { useState } from "react";
import AddMemory from "./AddMemory";
import DriveMode from "./DriveMode";

// The phone has two states: contribute a memory, then drive the projected view.
// One screen at a time, minimal chrome. Phase 3 enriches Add (date + audio +
// scatter placement); Phase 5 fills Drive with the joystick.
export type Mode = "add" | "drive";

export default function MobileApp() {
  const [mode, setMode] = useState<Mode>("add");

  return mode === "add" ? (
    <AddMemory onExplore={() => setMode("drive")} />
  ) : (
    <DriveMode onBack={() => setMode("add")} />
  );
}
