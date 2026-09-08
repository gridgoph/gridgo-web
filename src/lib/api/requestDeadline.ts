/** Bound token acquisition, response headers and body consumption as one request. */
export async function withRequestDeadline<T>(
  caller: AbortSignal | null | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(caller?.reason);
  const timer = setTimeout(() => controller.abort(new DOMException("The request timed out. Try again.", "TimeoutError")), 20_000);
  if (caller?.aborted) cancel();
  else caller?.addEventListener("abort", cancel, { once: true });
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  try {
    return await Promise.race([aborted, run(controller.signal)]);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
