"use client";

import { useEffect, useRef } from "react";

import { useLiveOptional } from "@/lib/live/LiveProvider";

/**
 * Re-read a legal or privacy screen when a staff inbox notice of that kind
 * arrives (`legal.*`, `privacy.*`). The API writes one for every create,
 * edit, publish and request change; it sends no live resource ping for them,
 * so the notice is the signal. Notices already in the inbox on mount do not
 * trigger a read; Refresh stays for everything else. A `null` prefix does
 * nothing, for callers that only sometimes listen.
 */
export function useLegalInboxReload(prefix: "legal." | "privacy." | null, load: () => unknown): void {
  const live = useLiveOptional();
  const notifications = live?.notifications;
  const seen = useRef<Set<string> | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!notifications || !prefix) return;
    const matching = notifications.filter((row) => row.type?.startsWith(prefix));
    if (seen.current === null) {
      seen.current = new Set(matching.map((row) => row.id));
      return;
    }
    let fresh = false;
    for (const row of matching) {
      if (seen.current.has(row.id)) continue;
      seen.current.add(row.id);
      fresh = true;
    }
    if (fresh) void loadRef.current();
  }, [notifications, prefix]);
}
