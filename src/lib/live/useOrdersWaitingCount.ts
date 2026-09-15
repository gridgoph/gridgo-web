"use client";

import { useCallback, useEffect, useState } from "react";

import { waitingOnOperationsCount } from "@/app/ops/_lib/pipeline";
import { listOrders } from "@/lib/api/client";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

/**
 * How many orders are waiting on Operations, kept current by the live stream.
 *
 * `null` until the first answer arrives, so a rail can draw nothing rather than
 * a zero that is about to change. A failed read keeps the last good number:
 * the pill is a hint, and the Orders page owns the error copy.
 */
export function useOrdersWaitingCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        setCount(waitingOnOperationsCount(await listOrders()));
      } catch {
        /* The queue page reports the failure; the pill just stays as it was. */
      }
    }, []),
  );

  useLiveReload("orders", load);

  useEffect(() => {
    void load();
  }, [load]);

  return count;
}
