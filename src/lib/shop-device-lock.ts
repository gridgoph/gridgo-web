/**
 * The shared shop PC's lock requests, in order (gridgo-api
 * docs/SHOP_TEAM_API.md: `POST /me/shop-team/working/lock` clears the session's
 * current turn, whoever holds it).
 *
 * Locking shows the picker at once, but the API hears of it a moment later.
 * If the next person's pick reached the API first, that late lock would end
 * the new turn. So every lock joins one queue, and a pick waits until the
 * last lock has landed; one that failed or never answered is sent again
 * first. A lock is safe to repeat: it only ever clears.
 */

import { lockWorkingDevice } from "@/lib/api/shop-team";

let queue: Promise<void> = Promise.resolve();
/** A lock was asked for and has not yet been confirmed by the API. */
let owed = false;

/** Lock the device on the API, after any lock already on its way. */
export function sendDeviceLock(): Promise<void> {
  owed = true;
  const next = queue.catch(() => undefined).then(async () => {
    await lockWorkingDevice();
    owed = false;
  });
  queue = next;
  return next;
}

/**
 * Before a pick: wait for the locks already sent, and send one more if the
 * last did not land. Rejects when the API still has not confirmed it, so the
 * pick is not sent into a turn a late lock could clear.
 */
export async function settleDeviceLock(): Promise<void> {
  await queue.catch(() => undefined);
  if (owed) await sendDeviceLock();
}

/** Sign-out and tests: nothing owed to a session that has ended. */
export function resetDeviceLock(): void {
  queue = Promise.resolve();
  owed = false;
}
