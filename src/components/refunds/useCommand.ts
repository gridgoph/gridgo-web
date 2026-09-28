"use client";

import { useCallback, useRef } from "react";

import { newIdempotencyKey } from "@/lib/api/client";
import { commandKeyCache } from "@/lib/refunds";

/**
 * Idempotency keys for one refund screen session.
 *
 * A retry of the same body reuses its key, so a timeout that actually landed
 * replays the saved answer instead of acting twice. `reset` starts a fresh
 * session (a dialog reopened for a new decision).
 */
export function useCommandKeys(): {
  keyFor: (body: unknown) => string;
  reset: () => void;
} {
  const cache = useRef(commandKeyCache(newIdempotencyKey));
  const keyFor = useCallback((body: unknown) => cache.current(body), []);
  const reset = useCallback(() => {
    cache.current = commandKeyCache(newIdempotencyKey);
  }, []);
  return { keyFor, reset };
}

/**
 * Uploads a picked file once. Retrying a record after the upload succeeded
 * reuses the same stored file, so the retried command carries the same body.
 */
export function useUploadOnce(
  upload: (file: File) => Promise<{ fileId: string }>,
): (file: File) => Promise<string> {
  const done = useRef(new WeakMap<File, string>());
  return useCallback(
    async (file: File) => {
      const existing = done.current.get(file);
      if (existing) return existing;
      const stored = await upload(file);
      done.current.set(file, stored.fileId);
      return stored.fileId;
    },
    [upload],
  );
}
