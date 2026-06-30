"use client";

import { Compass03, Plus } from "@untitledui/icons";
import type { Mode } from "./MobileApp";
import styles from "./mobile.module.css";

// Persistent glass segmented control — the always-available path between adding a
// memory and exploring the city. Floats top-centre over both screens (its own pointer
// events; the explore surface underneath keeps receiving joystick touches). Mirrors the
// browser's right-edge icon rail (Toolbar) so the phone reads as the same product.
export default function ModeSwitch({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className={styles.modeSwitch} role="tablist" aria-label="Phone mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "add"}
        data-active={mode === "add" ? "" : undefined}
        className={styles.segment}
        onClick={() => onChange("add")}
      >
        <Plus width={18} height={18} aria-hidden />
        Add
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "explore"}
        data-active={mode === "explore" ? "" : undefined}
        className={styles.segment}
        onClick={() => onChange("explore")}
      >
        <Compass03 width={18} height={18} aria-hidden />
        Explore
      </button>
    </div>
  );
}
