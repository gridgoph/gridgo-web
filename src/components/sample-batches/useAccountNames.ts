"use client";

import { useEffect, useRef, useState } from "react";

import { getUser } from "@/lib/api/client";

/**
 * Names for the client and shop ids a sample batch carries, read once per id
 * (`GET /users/:id`). A shop reads by its shop name; anyone else by their own.
 * An id that cannot be read stays unresolved (empty string).
 */
export function useAccountNames(ids: readonly (string | null | undefined)[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const key = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().join(",");

  useEffect(() => {
    const seen = asked.current;
    const missing = key.split(",").filter((id) => id && !seen.has(id));
    if (!missing.length) return;
    for (const id of missing) seen.add(id);
    let cancelled = false;
    let answered = false;
    void Promise.all(
      missing.map((id) =>
        getUser(id).then(
          (user) => [id, user?.supplierName || user?.name || ""] as const,
          () => [id, ""] as const,
        ),
      ),
    ).then((found) => {
      if (cancelled) return;
      answered = true;
      setNames((current) => ({ ...current, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
      // Ids whose answer was dropped are asked again on the next run.
      if (!answered) for (const id of missing) seen.delete(id);
    };
  }, [key]);

  return names;
}
