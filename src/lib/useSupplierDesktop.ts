"use client";

import { useSyncExternalStore } from "react";

/**
 * The supplier web's desktop layout starts at 1280px (gridgoph/gridgo-web#328);
 * narrower screens keep the phone app's single column. This is a layout
 * choice only: both layouts show the same things to the same roles.
 */
export const SUPPLIER_DESKTOP_QUERY = "(min-width: 1280px)";

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(SUPPLIER_DESKTOP_QUERY);
  query.addEventListener?.("change", listener);
  return () => query.removeEventListener?.("change", listener);
}

function read(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(SUPPLIER_DESKTOP_QUERY).matches);
}

export function useSupplierDesktop(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
