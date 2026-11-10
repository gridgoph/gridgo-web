"use client";

import { useEffect, useState } from "react";

import { getFileDownloadUrl } from "@/lib/api/client";
import type { HomePromoFile } from "@/lib/api/home-promos";

/** Renew a signed link this long before it stops working. */
const MARGIN_MS = 30_000;
/** A link from `/download-url` lives five minutes; renew it after four. */
const SIGNED_LIFE_MS = 4 * 60_000;

type Signed = { url: string | null; until: number };

/** The API's own link, while it still has time left; else null. */
function liveUrl(file: HomePromoFile, now: number): string | null {
  if (!file.url) return null;
  if (!file.expiresAt) return file.url;
  const until = Date.parse(file.expiresAt);
  return Number.isNaN(until) || until - MARGIN_MS > now ? file.url : null;
}

/**
 * Drawable URLs for promo files: the API's own signed `url` while it has
 * time left, otherwise a link read from `/files/:id/download-url`, renewed
 * before it expires. A file that cannot be read maps to null, and the
 * preview falls back to the business's initial.
 */
export function useFileUrls(files: (HomePromoFile | null | undefined)[]): Record<string, string | null> {
  const [signed, setSigned] = useState<Record<string, Signed>>({});
  const [now, setNow] = useState(() => Date.now());

  const present = files.filter((file): file is HomePromoFile => !!file);
  const need = present
    .filter((file) => !liveUrl(file, now))
    .map((file) => file.fileId)
    .filter((id, i, all) => all.indexOf(id) === i)
    .filter((id) => !signed[id] || signed[id].until <= now)
    .sort()
    .join(",");

  useEffect(() => {
    if (!need) return;
    let cancelled = false;
    for (const id of need.split(",")) {
      getFileDownloadUrl(id)
        .then((url) => !cancelled && setSigned((s) => ({ ...s, [id]: { url, until: Date.now() + SIGNED_LIFE_MS } })))
        .catch(() => !cancelled && setSigned((s) => ({ ...s, [id]: { url: null, until: Date.now() + SIGNED_LIFE_MS } })));
    }
    return () => {
      cancelled = true;
    };
  }, [need]);

  // Wake at the soonest expiry, and when the tab comes back.
  const expiries = present
    .map((file) => {
      const own = file.url && file.expiresAt ? Date.parse(file.expiresAt) - MARGIN_MS : NaN;
      const fetched = signed[file.fileId]?.until ?? NaN;
      return [own, fetched].filter((at) => !Number.isNaN(at) && at > now);
    })
    .flat();
  const soonest = expiries.length ? Math.min(...expiries) : null;
  useEffect(() => {
    if (soonest === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1_000, soonest - Date.now()));
    return () => window.clearTimeout(timer);
  }, [soonest]);
  useEffect(() => {
    const wake = () => document.visibilityState !== "hidden" && setNow(Date.now());
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  const out: Record<string, string | null> = {};
  for (const file of present) {
    // While a renewal is in flight, keep drawing the last link rather than flashing blank.
    out[file.fileId] = liveUrl(file, now) ?? signed[file.fileId]?.url ?? file.url ?? null;
  }
  return out;
}
