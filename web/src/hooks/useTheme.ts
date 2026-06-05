"use client";

import { useSyncExternalStore } from "react";

// Dark/light theme, stored on <html data-theme> and in localStorage. The initial
// attribute is set pre-paint by the inline script in layout.tsx (no flash); this
// hook reads it, lets components toggle it, and keeps every consumer (the toolbar
// toggle and the R3F canvas background) in sync via a custom window event.

export type Theme = "dark" | "light";

const KEY = "cmc-theme";
const EVENT = "cmc-themechange";

export function getTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private-mode / storage-disabled: theme still applies for the session.
  }
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

// Subscribe to the theme via the DOM (the source of truth, set pre-paint and on
// every toggle). useSyncExternalStore keeps SSR ("dark") and the post-hydration
// client value (read from <html data-theme>) consistent without a setState-in-
// effect, and re-renders all consumers when the toggle dispatches EVENT.
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as Theme);
  const toggle = () => setTheme(getTheme() === "dark" ? "light" : "dark");
  return { theme, toggle };
}
