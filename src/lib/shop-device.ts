/**
 * The shared shop PC ("Who's working?", gridgo-api docs/SHOP_TEAM_API.md,
 * "Phone-free Staff and shared devices"; gridgoph/gridgo-web#328).
 *
 * A shop signs one account in on its counter PC and lets phone-free staff
 * work on it by PIN. Rules this module keeps:
 *
 * - The worker token lives in this module's memory only: never storage, a
 *   cookie, a URL or a log. A reload drops it and the PC shows the picker.
 * - The PIN itself never reaches here; the picker sends it and forgets it.
 * - Once the PC is shared, a lock, an expired turn or any worker error goes
 *   back to the picker. Nothing falls back to the signed-in account: the API
 *   keeps the device locked until that Clerk session signs out.
 * - The PC locks itself after {@link IDLE_LOCK_MS} without use (firstmate's
 *   decision for the report's open question: 15 minutes), and at once when
 *   its window is hidden or minimised.
 */

import type { ShopWorker } from "@/lib/api/types";

/** Idle time before a shared PC locks back to "Who's working?". */
export const IDLE_LOCK_MS = 15 * 60_000;

/** The API's worker refusals. Each one means "show the picker", never retry. */
export const WORKER_LOCK_CODES: ReadonlySet<string> = new Set([
  "shop_worker_locked",
  "shop_worker_invalid",
  "shop_device_session_required",
]);

export function isWorkerLockCode(code: string | null | undefined): boolean {
  return Boolean(code && WORKER_LOCK_CODES.has(code));
}

/** Why the picker is showing; the picker says it in one line. */
/**
 * - `away`: the window was hidden or minimised (the API asks a shared device
 *   to lock in the background).
 */
export type LockReason = "idle" | "expired" | "switch" | "ended" | "away" | null;

export type ShopDeviceState = {
  /** This tab is a shared shop PC (picked, locked, or the API says so). */
  shared: boolean;
  /**
   * The Owner pressed "Share this PC" and the handover is under way: the
   * account's live stream and push stay off from here, whether or not it
   * goes through.
   */
  preparing: boolean;
  /** The PIN person working now, or null while the picker shows. */
  worker: ShopWorker | null;
  /** When the API ends this turn (30 minutes after the PIN). */
  expiresAt: string | null;
  lockReason: LockReason;
};

const OFF: ShopDeviceState = {
  shared: false,
  preparing: false,
  worker: null,
  expiresAt: null,
  lockReason: null,
};

let state: ShopDeviceState = OFF;
/** Memory only. Read through {@link workerTokenHeader}. */
let token: string | null = null;
/**
 * Which turn this is. Every pick, lock and sign-out starts a new one, so an
 * answer to a request sent under an earlier turn can never end a later one.
 */
let turn = 0;
const listeners = new Set<() => void>();

function set(next: ShopDeviceState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeShopDevice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function shopDeviceSnapshot(): ShopDeviceState {
  return state;
}

/** The header the API client adds to every request while someone is picked. */
export function workerTokenHeader(): string | null {
  return token;
}

/**
 * The turn a request is sent under: its token (or none) and which turn that
 * was. The API client keeps it with the request and hands it back to
 * {@link noteWorkerRefusal}.
 */
export function currentWorkerTurn(): { token: string | null; turn: number } {
  return { token, turn };
}

/** The PC is (now) shared and nobody is picked: show the picker. */
export function lockShopDevice(reason: LockReason = null) {
  token = null;
  turn += 1;
  set({ shared: true, preparing: false, worker: null, expiresAt: null, lockReason: reason });
}

/** A PIN was accepted: this person works until a lock, idle or the turn's end. */
export function startWorkerTurn(selection: {
  worker: { id?: string; pinStaffId?: string; name: string; role: ShopWorker["role"] };
  token: string;
  expiresAt: string;
}) {
  token = selection.token;
  turn += 1;
  set({
    shared: true,
    preparing: false,
    worker: {
      pinStaffId: selection.worker.pinStaffId ?? selection.worker.id ?? "",
      name: selection.worker.name,
      role: selection.worker.role,
    },
    expiresAt: selection.expiresAt,
    lockReason: null,
  });
}

/**
 * A request came back with a worker refusal. The token is dropped at once so
 * nothing retries it, and the picker takes over. `sentUnder` is the turn the
 * request went out in: a refusal of an earlier turn (Ana's slow read
 * answering after Lito picked) leaves the current turn alone.
 */
export function noteWorkerRefusal(code: string | null | undefined, sentUnder?: number) {
  if (!isWorkerLockCode(code)) return;
  if (sentUnder !== undefined && sentUnder !== turn) return;
  if (state.shared && !state.worker && !token) return;
  lockShopDevice(state.worker ? "ended" : state.lockReason);
}

/** "Share this PC" was confirmed: close the account's personal delivery now. */
export function beginSharedHandover() {
  if (state.shared) return;
  set({ ...state, preparing: true });
}

/** The handover failed: this stays the account's PC, with what it showed before. */
export function cancelSharedHandover() {
  if (state.shared) return;
  set({ ...state, preparing: false });
}

/** Sign-out and tests: forget everything. */
export function resetShopDevice() {
  token = null;
  turn += 1;
  set(OFF);
}

/**
 * Whether a picked turn must end now, and why: 15 minutes without use, or
 * the API's 30-minute turn running out. Pure, so it is tested with a clock.
 */
export function turnEndReason(
  current: Pick<ShopDeviceState, "worker" | "expiresAt">,
  lastActivityAt: number,
  now: number,
): "idle" | "expired" | null {
  if (!current.worker) return null;
  if (current.expiresAt && Date.parse(current.expiresAt) <= now) return "expired";
  if (now - lastActivityAt >= IDLE_LOCK_MS) return "idle";
  return null;
}

/** The picker's one line about why it is showing. */
export function lockReasonLine(reason: LockReason): string | null {
  switch (reason) {
    case "idle":
      return "Locked after 15 minutes without use.";
    case "away":
      return "Locked when this window was hidden. Type your PIN to carry on.";
    case "expired":
      return "That turn ended after 30 minutes. Type your PIN to carry on.";
    case "ended":
      return "That turn ended. Type your PIN to carry on.";
    default:
      return null;
  }
}
