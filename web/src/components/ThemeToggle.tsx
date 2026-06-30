"use client";

import { Toggle01Left, Toggle01Right } from "@untitledui/icons";
import { useTheme } from "@/hooks/useTheme";
import styles from "./ThemeToggle.module.css";

// Standalone dark/light switch, pinned top-right. The knob sits left in dark mode
// and slides right in light mode. The switch glyphs come from @untitledui/icons
// (see CLAUDE.md); they fill the button via width/height 100% and inherit color
// through stroke="currentColor".

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      className={styles.toggle}
      title={label}
      aria-label={label}
      aria-pressed={theme === "light"}
      onClick={toggle}
    >
      {theme === "light" ? (
        <Toggle01Right width="100%" height="100%" />
      ) : (
        <Toggle01Left width="100%" height="100%" />
      )}
    </button>
  );
}
