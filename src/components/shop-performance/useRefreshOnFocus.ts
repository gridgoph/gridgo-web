"use client";

import { useEffect, useRef } from "react";

/**
 * Re-read when the tab comes back into view. A Top Pick demotion and the
 * 30-day counts expire with time, and no push arrives when they do.
 */
export function useRefreshOnFocus(load: () => void | Promise<void>): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void loadRef.current();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
