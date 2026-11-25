"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

const idle = async () => {};

/**
 * One read, kept fresh by the live stream (orders move the budget, identity
 * moves partners). A failed refresh keeps what is on screen and says so; only
 * a first load that fails takes the screen. `put` installs a write's answer.
 */
export function usePartnerData<T>(read: () => Promise<T>, live = true) {
  const [data, setData] = useState<T | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const has = useRef(false);
  /** Moves on every write, so a read answered before it is dropped. */
  const epoch = useRef(0);

  const load = useSerializedLoad(
    useCallback(async () => {
      const started = epoch.current;
      try {
        const next = await read();
        if (epoch.current !== started) return;
        has.current = true;
        setData(next);
        setLoadError(null);
        setRefreshError(null);
      } catch (err) {
        if (epoch.current !== started) return;
        if (has.current) setRefreshError(err);
        else setLoadError(err);
      }
    }, [read]),
  );

  useEffect(() => {
    void load();
  }, [load]);
  // A form must not be rebased onto someone else's version while it is open.
  useLiveReload(["orders", "identity"], live ? load : idle);

  const put = useCallback((update: (current: T) => T) => {
    epoch.current += 1;
    setData((current) => (current === null ? current : update(current)));
  }, []);

  const retry = useCallback(() => {
    setLoadError(null);
    setRefreshError(null);
    void load();
  }, [load]);

  return { data, loadError, refreshError, load, put, retry };
}
