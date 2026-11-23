"use client";

import { useCallback, useEffect, useState } from "react";

import { listMyProductSetupRequests } from "@/lib/api/product-templates";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { normalizeSetupRequests, type SetupRequest, type SetupRequestKind } from "@/lib/product-templates";

/** The shop's own requests of one kind, newest first. Quietly empty when they cannot load. */
export function useSetupRequests(kind: SetupRequestKind): {
  requests: SetupRequest[];
  reload: () => Promise<void>;
} {
  const [requests, setRequests] = useState<SetupRequest[]>([]);
  const reload = useCallback(async () => {
    try {
      setRequests(
        normalizeSetupRequests(await listMyProductSetupRequests()).filter((r) => r.kind === kind),
      );
    } catch {
      setRequests([]);
    }
  }, [kind]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useLiveReload("catalog", reload);
  return { requests, reload };
}
