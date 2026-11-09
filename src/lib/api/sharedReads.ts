const reads = new Map<string, Promise<unknown>>();
const invalidations = new WeakSet<object>();

/** Forget results as well as flights: a read begun before a change is stale. */
export function clearSharedReads(): void {
  reads.clear();
}

/** Several subscribers see the same ping/notice; invalidate its batch once. */
export function invalidateSharedReads(event: object): void {
  if (invalidations.has(event)) return;
  invalidations.add(event);
  clearSharedReads();
}

/**
 * One owner for identical reads in a refresh batch. Keep the settled promise
 * through this event-loop turn so immediate responses and queued loads share
 * the result too. There is no freshness cache: a later refresh or navigation
 * reads again, even while the live stream is connected.
 */
export function sharedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const current = reads.get(key);
  if (current) return current as Promise<T>;
  const promise = load();
  reads.set(key, promise);
  const remove = () => {
    if (reads.get(key) === promise) reads.delete(key);
  };
  void promise.then(() => setTimeout(remove, 0), remove);
  return promise;
}
