"use client";

import { useState } from "react";
import AddMemory from "./AddMemory";
import DriveMode from "./DriveMode";
import ModeSwitch from "./ModeSwitch";

// The phone has two modes: contribute a memory, or explore the projected view. A
// persistent glass segmented control (ModeSwitch) switches between them at any time —
// no upload required to start exploring. Minimal chrome, one screen beneath the switch.
export type Mode = "add" | "explore";

export default function MobileApp() {
  const [mode, setMode] = useState<Mode>("add");

  return (
    <>
      <ModeSwitch mode={mode} onChange={setMode} />
      {mode === "add" ? (
        <AddMemory onExplore={() => setMode("explore")} />
      ) : (
        <DriveMode />
      )}
    </>
  );
}
