/**
 * The portal theme: light, dark, or whatever the device prefers.
 *
 * The tokens in `globals.css` already pair light and dark. This module only
 * decides which pair wins: an explicit choice is a `light` or `dark` class on
 * `<html>` and is remembered per browser; with neither class the device
 * preference applies, exactly as before the toggle existed.
 */

export type ThemePreference = "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "gridgo-theme";

/**
 * Runs before first paint so a remembered choice never flashes the other
 * theme. Kept tiny and dependency-free because it is inlined into the document.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"||t==="light"){document.documentElement.classList.add(t)}}catch(e){}})();`;

export function readThemePreference(): ThemePreference | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

/** What is on screen right now: the explicit class if any, else the device preference. */
export function resolveTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  const root = document.documentElement.classList;
  if (root.contains("light")) return "light";
  if (root.contains("dark")) return "dark";
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Sets the explicit theme on `<html>` and remembers it for this browser. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement.classList;
  root.remove("light", "dark");
  root.add(preference);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* Private mode or blocked storage: the choice still applies to this page. */
  }
}
