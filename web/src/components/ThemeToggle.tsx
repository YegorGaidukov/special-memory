"use client";

import { useTheme } from "@/hooks/useTheme";
import styles from "./ThemeToggle.module.css";

// Standalone dark/light switch, pinned top-right. The knob sits left in dark mode
// and slides right in light mode (the two switch glyphs the user supplied).

const SwitchLeft = (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2 12C2 8.68629 4.68629 6 8 6H16C19.3137 6 22 8.68629 22 12C22 15.3137 19.3137 18 16 18H8C4.68629 18 2 15.3137 2 12Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 14.5C9.38071 14.5 10.5 13.3807 10.5 12C10.5 10.6193 9.38071 9.5 8 9.5C6.61929 9.5 5.5 10.6193 5.5 12C5.5 13.3807 6.61929 14.5 8 14.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SwitchRight = (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2 12C2 8.68629 4.68629 6 8 6H16C19.3137 6 22 8.68629 22 12C22 15.3137 19.3137 18 16 18H8C4.68629 18 2 15.3137 2 12Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 14.5C17.3807 14.5 18.5 13.3807 18.5 12C18.5 10.6193 17.3807 9.5 16 9.5C14.6193 9.5 13.5 10.6193 13.5 12C13.5 13.3807 14.6193 14.5 16 14.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
      {theme === "light" ? SwitchRight : SwitchLeft}
    </button>
  );
}
