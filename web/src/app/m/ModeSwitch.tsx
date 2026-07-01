"use client";

import type { Mode } from "./MobileApp";
import styles from "./mobile.module.css";

// Shared chrome (5b): three floating monospace labels centred at the top — no pill,
// no box. The active label goes bold + full-opacity ink; the others are faint. Floats
// over every screen; the surfaces underneath keep receiving touches.
const TABS: { mode: Mode; label: string }[] = [
  { mode: "add", label: "Add" },
  { mode: "navigate", label: "Navigate" },
  { mode: "explore", label: "Explore" },
];

export default function ModeSwitch({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Phone mode">
      {TABS.map((t) => (
        <button
          key={t.mode}
          type="button"
          role="tab"
          aria-selected={mode === t.mode}
          className={`${styles.tab} ${mode === t.mode ? styles.tabActive : ""}`}
          onClick={() => onChange(t.mode)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
