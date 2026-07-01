"use client";

import { useEffect, useRef, useState } from "react";
import {
  Edit05,
  Map01,
  BookOpen01,
  Settings04,
  Sun,
  Moon01,
  VolumeMax,
  VolumeX,
} from "@untitledui/icons";
import { useTheme } from "@/hooks/useTheme";
import styles from "./Toolbar.module.css";

// The explorer's top-right action rail: a slim vertical pill that stays collapsed
// to a single Settings toggle by default, keeping the void uncluttered. Clicking
// Settings unwraps the pill downward to reveal every chrome control — Edit
// (curator placement mode), Map (ground plane), Library (memory list), the
// dark/light Theme switch, and Sound on/off. Clicking Settings again, or anywhere
// outside the pill (e.g. the canvas), collapses it back. Icons-only by design:
// there are no keyboard shortcuts, so each button carries a title/aria-label.
// Icons come from @untitledui/icons (see CLAUDE.md); they fill the button via
// width/height 100% and inherit color through stroke="currentColor".

export default function Toolbar({
  mapVisible,
  libraryOpen,
  soundEnabled,
  onEdit,
  onToggleMap,
  onToggleLibrary,
  onToggleSound,
}: {
  mapVisible: boolean;
  libraryOpen: boolean;
  soundEnabled: boolean;
  onEdit: () => void;
  onToggleMap: () => void;
  onToggleLibrary: () => void;
  onToggleSound: () => void;
}) {
  const [open, setOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  // Collapse when the pointer goes down anywhere outside the rail (canvas
  // clicks land on document too). Only listen while expanded.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!railRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <div className={styles.rail} ref={railRef}>
      <button
        type="button"
        className={styles.btn}
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        data-active={open || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Settings04 width="100%" height="100%" />
      </button>
      <div className={styles.group} data-open={open || undefined} aria-hidden={!open}>
        <div className={styles.groupInner}>
          <button
            type="button"
            className={styles.btn}
            title="Edit placements"
            aria-label="Edit placements"
            tabIndex={open ? 0 : -1}
            onClick={onEdit}
          >
            <Edit05 width="100%" height="100%" />
          </button>
          <button
            type="button"
            className={styles.btn}
            title="Map"
            aria-label="Map"
            aria-pressed={mapVisible}
            data-active={mapVisible || undefined}
            tabIndex={open ? 0 : -1}
            onClick={onToggleMap}
          >
            <Map01 width="100%" height="100%" />
          </button>
          <button
            type="button"
            className={styles.btn}
            title="Library"
            aria-label="Library"
            aria-pressed={libraryOpen}
            data-active={libraryOpen || undefined}
            tabIndex={open ? 0 : -1}
            onClick={onToggleLibrary}
          >
            <BookOpen01 width="100%" height="100%" />
          </button>
          <button
            type="button"
            className={styles.btn}
            title={themeLabel}
            aria-label={themeLabel}
            aria-pressed={theme === "light"}
            tabIndex={open ? 0 : -1}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Moon01 width="100%" height="100%" />
            ) : (
              <Sun width="100%" height="100%" />
            )}
          </button>
          <button
            type="button"
            className={styles.btn}
            title={soundEnabled ? "Mute sound" : "Enable sound"}
            aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
            aria-pressed={soundEnabled}
            data-active={soundEnabled || undefined}
            tabIndex={open ? 0 : -1}
            onClick={onToggleSound}
          >
            {soundEnabled ? (
              <VolumeMax width="100%" height="100%" />
            ) : (
              <VolumeX width="100%" height="100%" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
