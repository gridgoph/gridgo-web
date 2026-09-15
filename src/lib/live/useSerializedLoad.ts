"use client";

import { useCallback, useRef } from "react";

type PendingLoad = {
  run: () => Promise<void>;
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

export function useSerializedLoad<Args extends unknown[]>(
  load: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  const running = useRef(false);
  const pending = useRef<PendingLoad | null>(null);

  return useCallback(
    (...args: Args) => {
      const run = () => load(...args);
      if (running.current) {
        if (pending.current) {
          pending.current.run = run;
        } else {
          let resolve!: () => void;
          let reject!: (reason: unknown) => void;
          const promise = new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
          });
          pending.current = { run, promise, resolve, reject };
        }
        return pending.current.promise;
      }

      const execute = async (task: () => Promise<void>): Promise<void> => {
        running.current = true;
        try {
          await task();
        } finally {
          const next = pending.current;
          pending.current = null;
          if (next) void execute(next.run).then(next.resolve, next.reject);
          else running.current = false;
        }
      };
      return execute(run);
    },
    [load],
  );
}
