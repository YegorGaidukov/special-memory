"use client";

import { useEffect, useState } from "react";
import AddMemory from "./AddMemory";
import DriveMode from "./DriveMode";
import ExploreField from "./ExploreField";
import Grain from "./Grain";
import ModeSwitch from "./ModeSwitch";
import ShadowField from "./ShadowField";
import { useMemories } from "@/hooks/useMemories";
import type { TimeRange } from "@/lib/explore/timeline";
import styles from "./mobile.module.css";

// The phone companion (design 5b). Three modes float on one shared, animated
// leaf-shadow field: Add a memory, Navigate the projected city (joystick + gyro +
// timeline), or Explore a top-down map of the memories. The timeline's year range is
// lifted here so both Navigate (which sets it, and broadcasts it to the projector) and
// Explore (which dims out-of-range memories) share one source of truth.
export type Mode = "add" | "navigate" | "explore";

export default function MobileApp() {
  const [mode, setMode] = useState<Mode>("add");
  const [range, setRange] = useState<TimeRange | null>(null);
  const { records, reload } = useMemories();

  // Refresh the read model when leaving Add (a fresh contribution should appear).
  useEffect(() => {
    if (mode !== "add") reload();
  }, [mode, reload]);

  return (
    <div className={styles.root}>
      <ShadowField />
      <Grain />
      <ModeSwitch mode={mode} onChange={setMode} />

      {mode === "add" && <AddMemory onAdded={() => setMode("explore")} />}
      {mode === "navigate" && (
        <DriveMode records={records} range={range} onRangeChange={setRange} />
      )}
      {mode === "explore" && <ExploreField records={records} range={range} />}
    </div>
  );
}
