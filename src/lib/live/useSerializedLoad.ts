"use client";

import { useCallback, useRef } from "react";

export function useSerializedLoad<Args extends unknown[]>(
  load: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  const pending = useRef<Promise<void> | null>(null);

  return useCallback(
    (...args: Args) => {
      const run = async () => {
        await load(...args);
      };
      const flight = pending.current ? pending.current.then(run, run) : run();
      pending.current = flight;
      const clear = () => {
        if (pending.current === flight) pending.current = null;
      };
      void flight.then(clear, clear);
      return flight;
    },
    [load],
  );
}
