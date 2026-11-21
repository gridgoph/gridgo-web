"use client";

import { useEffect, useRef } from "react";

import { shortcutAllowed } from "@/lib/express-shop";

/**
 * One letter key (A, R) that presses a button, only while `enabled` and only
 * when the person is not typing (`shortcutAllowed`). The handler is read fresh
 * on each press, so callers need not memoise it.
 */
export function useShortcut(key: string, handler: () => void, enabled: boolean): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const wanted = key.toLowerCase();
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== wanted) return;
      if (event.defaultPrevented || !shortcutAllowed(event)) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}
