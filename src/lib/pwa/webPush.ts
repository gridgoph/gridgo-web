import {
  getWebPushPublicKey,
  isApiError,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/api/client";
import type { WebPushSubscriptionInput } from "@/lib/api/types";
import {
  ensureDesktopAlertWorker,
  readDesktopAlertPermission,
  type DesktopAlertPermission,
} from "@/lib/live/desktopAlerts";
import { iosSupportsWebPush, readDevice, type DeviceKind } from "@/lib/pwa/install";

/**
 * Phone notifications for a shop: Web Push to this browser, so a new job
 * reaches the lock screen with GRIDGO closed. Contract: gridgo-api
 * `docs/WEB_PUSH_API.md` (`GET /web-push/public-key`, `POST /web-push/subscribe`,
 * `POST /web-push/unsubscribe`, supplier only).
 *
 * Rules:
 * - Permission is asked for only from a tap on "Turn on notifications", and it
 *   is the first thing that tap does: Safari drops the request if the tap's
 *   activation has been spent on network work first.
 * - On iPhone and iPad this works only in the installed app, on iOS 16.4+; a
 *   Safari tab has no push at all, so the step says "add it first".
 * - "On" means this browser holds a subscription. The API copy is refreshed on
 *   every visit (`syncWebPush`), which also heals a save that failed.
 * - The worker (`public/desk-alerts-sw.js`) shows every push and opens the slip
 *   through `/supplier/notice`. It caches nothing.
 */

/**
 * - `unsupported`: this browser has no Web Push.
 * - `needs-install`: iOS 16.4+ in a Safari tab; add to Home Screen first.
 * - `ios-too-old`: iOS before 16.4 has no push for web apps.
 * - `blocked`: notifications are denied for this site.
 * - `ask`: never asked; the tap will ask.
 * - `off`: allowed, but this browser holds no subscription.
 * - `on`: subscribed.
 */
/** The account whose subscription the API holds, as of this page load. */
let syncedFor: string | null = null;

/**
 * Which account turned notifications on in this browser. A different account
 * signing in here must not inherit the subscription: sync drops it instead of
 * re-sending it under the new account.
 */
export const WEB_PUSH_OWNER_KEY = "gridgo-web.web-push-owner";

function readOwner(): string | null {
  try {
    return window.localStorage.getItem(WEB_PUSH_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string | null): void {
  try {
    if (userId) window.localStorage.setItem(WEB_PUSH_OWNER_KEY, userId);
    else window.localStorage.removeItem(WEB_PUSH_OWNER_KEY);
  } catch {
    // Private mode: the next sync re-checks against the API's own binding.
  }
}

export type WebPushStatus =
  "unsupported" | "needs-install" | "ios-too-old" | "blocked" | "ask" | "off" | "on";

export type PushFeatures = {
  secure: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
};

export function readPushFeatures(): PushFeatures {
  if (typeof window === "undefined") {
    return {
      secure: false,
      serviceWorker: false,
      pushManager: false,
      notification: false,
    };
  }
  return {
    secure: window.isSecureContext !== false,
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification:
      typeof (window as { Notification?: unknown }).Notification === "function",
  };
}

/** Whether this browser can hold a push subscription at all, and if not, why. */
export function pushSupport(
  device: DeviceKind,
  features: PushFeatures,
): "supported" | "needs-install" | "ios-too-old" | "unsupported" {
  const capable =
    features.secure &&
    features.serviceWorker &&
    features.pushManager &&
    features.notification;
  if (device.ios) {
    if (!iosSupportsWebPush(device.iosVersion)) return "ios-too-old";
    if (!device.standalone) return "needs-install";
    return capable ? "supported" : "ios-too-old";
  }
  return capable ? "supported" : "unsupported";
}

export function webPushStatusFor(
  support: ReturnType<typeof pushSupport>,
  permission: DesktopAlertPermission,
  subscribed: boolean,
): WebPushStatus {
  if (support !== "supported") return support;
  if (permission === "unsupported") return "unsupported";
  if (permission === "denied") return "blocked";
  if (permission === "default") return "ask";
  return subscribed ? "on" : "off";
}

/** VAPID keys travel base64url; `subscribe` wants the raw bytes. */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  if (bytes.length !== wanted.length) return false;
  return bytes.every((value, index) => value === wanted[index]);
}

/** `PushSubscription.toJSON()`, checked, in the shape the API takes. */
export function subscriptionInput(
  subscription: PushSubscription,
): WebPushSubscriptionInput | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const ready = await ensureDesktopAlertWorker();
  return ready?.pushManager ? ready : null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport(readDevice(), readPushFeatures()) !== "supported") return null;
  const ready = await registration();
  if (!ready) return null;
  try {
    return await ready.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function readWebPushStatus(): Promise<WebPushStatus> {
  const support = pushSupport(readDevice(), readPushFeatures());
  const permission = readDesktopAlertPermission();
  if (support !== "supported" || permission !== "granted") {
    return webPushStatusFor(support, permission, false);
  }
  const subscription = await currentSubscription();
  return webPushStatusFor(support, permission, Boolean(subscription));
}

function requestPermission(): Promise<DesktopAlertPermission> {
  const api = (window as { Notification?: typeof Notification }).Notification;
  if (!api) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    const settle = (value: string) =>
      resolve(value === "granted" || value === "denied" ? value : "default");
    try {
      const pending = api.requestPermission(settle) as Promise<string> | undefined;
      pending?.then(settle, () => settle(api.permission));
    } catch {
      settle(api.permission);
    }
  });
}

export type TurnOnOutcome =
  | { status: WebPushStatus }
  /** Permission was given but subscribing or saving failed; `reason` is screen copy. */
  | { status: WebPushStatus; reason: string };

/** Plain-language reason for a failed turn-on. Never the API's own message. */
export function webPushErrorCopy(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === "web_push_unavailable") {
      return "GRIDGO can't send phone notifications yet. Try again later.";
    }
    if (error.kind === "forbidden") {
      return "Only a shop account can turn on phone notifications.";
    }
    if (error.code === "invalid_web_push_subscription") {
      return "This browser gave GRIDGO a subscription it can't use. Reload and try again.";
    }
    if (error.kind === "unauthorized")
      return "Your sign-in has ended. Sign in again, then retry.";
  }
  return "Couldn't turn on notifications. Check your connection and try again.";
}

/**
 * "Turn on notifications". Call straight from the tap handler: asking for
 * permission is the first await. `publicKey` is the key read ahead of the tap
 * (`prefetchWebPushKey`) so nothing waits on the network before the ask.
 */
export async function turnOnWebPush(
  publicKey: string | null,
  userId: string | null,
): Promise<TurnOnOutcome> {
  let permission = readDesktopAlertPermission();
  if (permission === "default") permission = await requestPermission();
  const support = pushSupport(readDevice(), readPushFeatures());
  if (permission !== "granted")
    return { status: webPushStatusFor(support, permission, false) };
  try {
    const ready = await registration();
    if (!ready) throw new Error("no worker");
    const key = applicationServerKey(publicKey ?? (await getWebPushPublicKey()));
    let subscription = await ready.pushManager.getSubscription();
    if (subscription && readOwner() !== userId) {
      // Another account's (or an unknown owner's): end it everywhere, then
      // start one that belongs to this account.
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe().catch(() => undefined);
      await unsubscribeWebPush(endpoint).catch(() => undefined);
      subscription = null;
    }
    if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
      // The server's keys changed: an old subscription can no longer be sent to.
      await subscription.unsubscribe().catch(() => undefined);
      subscription = null;
    }
    subscription ??= await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    const input = subscriptionInput(subscription);
    if (!input) throw new Error("incomplete subscription");
    await subscribeWebPush(input);
    writeOwner(userId);
    syncedFor = userId;
    await ready
      .showNotification("Notifications are on", {
        body: "New jobs and order updates will show here, even with GRIDGO closed.",
        tag: "gridgo-push-on",
        icon: "/pwa/icon-192.png",
        badge: "/pwa/badge-96.png",
      })
      .catch(() => undefined);
    return { status: "on" };
  } catch (error) {
    return { status: await readWebPushStatus(), reason: webPushErrorCopy(error) };
  }
}

/** "Turn off": this browser stops receiving pushes; the API forgets it. */
export async function turnOffWebPush(): Promise<WebPushStatus> {
  const subscription = await currentSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => undefined);
    // Best effort: a push service answers 410 for a dead endpoint and the API
    // prunes it on its own.
    await unsubscribeWebPush(endpoint).catch(() => undefined);
  }
  writeOwner(null);
  return readWebPushStatus();
}

/**
 * Once per page load in the supplier tree: re-send a subscription this
 * browser already holds, so the API's copy survives a failed save, a key the
 * browser rotated, or a database restore. Never asks for permission.
 */
export async function syncWebPush(userId: string): Promise<void> {
  if (syncedFor === userId) return;
  syncedFor = userId;
  if (readDesktopAlertPermission() !== "granted") return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  if (readOwner() !== userId) {
    // Another account turned this on (its session ended without signing out),
    // or the owner record is gone. Drop it rather than move it: this account
    // never asked, and turning it back on is one tap.
    await subscription.unsubscribe().catch(() => undefined);
    writeOwner(null);
    return;
  }
  const input = subscriptionInput(subscription);
  if (!input) return;
  await subscribeWebPush(input).catch(() => {
    syncedFor = null;
  });
}

let keyPromise: Promise<string | null> | null = null;

/** Read the server key ahead of the tap. Null while the server has none. */
export function prefetchWebPushKey(): Promise<string | null> {
  keyPromise ??= getWebPushPublicKey().catch(() => {
    keyPromise = null;
    return null;
  });
  return keyPromise;
}

/**
 * Sign-out on a shared phone: stop this browser receiving the shop's pushes
 * before the session ends (the API call needs it). Bounded, so a slow network
 * never holds up signing out.
 */
export async function releaseWebPushForSignOut(timeoutMs = 3_000): Promise<void> {
  const pending = currentSubscription();
  const timedOut = Symbol("timed out");
  const subscription = await Promise.race([
    pending,
    new Promise<typeof timedOut>((resolve) =>
      setTimeout(() => resolve(timedOut), timeoutMs),
    ),
  ]);
  if (subscription === timedOut) {
    // Too slow to wait for, but never skipped: the browser drops it as soon
    // as it answers, and the push service then reports the endpoint dead.
    // The owner record stays until it is actually gone, so the next sign-in
    // here can still tell it was someone else's.
    void pending
      .then(async (late) => {
        if (late) await late.unsubscribe();
        writeOwner(null);
      })
      .catch(() => undefined);
    syncedFor = null;
    return;
  }
  if (!subscription) return;
  // The browser first: once it has dropped the subscription nothing more can
  // arrive here, whatever happens to the API call after it.
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  writeOwner(null);
  syncedFor = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await unsubscribeWebPush(endpoint, { signal: controller.signal });
  } catch {
    // The API copy goes stale; the push service will report the dead endpoint.
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam. */
export function resetWebPushForTests(): void {
  syncedFor = null;
  keyPromise = null;
}
