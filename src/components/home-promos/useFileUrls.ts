"use client";

import { useEffect, useState } from "react";

import { getFileDownloadUrl } from "@/lib/api/client";
import type { HomePromoFile } from "@/lib/api/home-promos";

/**
 * Drawable URLs for promo files: the API's own `url` when it sent one,
 * otherwise a signed link read once per file id. A file that cannot be read
 * maps to null, and the preview falls back to the business's initial.
 */
export function useFileUrls(files: (HomePromoFile | null | undefined)[]): Record<string, string | null> {
  const [signed, setSigned] = useState<Record<string, string | null>>({});
  const missing = files
    .filter((file): file is HomePromoFile => !!file && !file.url)
    .map((file) => file.fileId)
    .filter((id, i, all) => all.indexOf(id) === i)
    .sort()
    .join(",");

  useEffect(() => {
    if (!missing) return;
    let cancelled = false;
    for (const id of missing.split(",")) {
      if (id in signed) continue;
      getFileDownloadUrl(id)
        .then((url) => !cancelled && setSigned((s) => ({ ...s, [id]: url })))
        .catch(() => !cancelled && setSigned((s) => ({ ...s, [id]: null })));
    }
    return () => {
      cancelled = true;
    };
    // `signed` is read only to skip ids already asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);

  const out: Record<string, string | null> = {};
  for (const file of files) {
    if (!file) continue;
    out[file.fileId] = file.url ?? signed[file.fileId] ?? null;
  }
  return out;
}
