import type { Notification, Role } from "@/lib/api/types";
import { ARRIVAL_TOAST_COALESCE_MS, burstTitle } from "@/lib/live/arrivalToast";
import { notificationHref } from "@/lib/live/notificationHref";

/**
 * Desktop alerts: the Desk, for a person looking at another tab or window.
 *
 * The chime and the arrival toast only reach someone looking at this tab. A
 * desktop alert is the same fresh slip, raised by the operating system while
 * GRIDGO sits in the background. Rules that keep it honest:
 *
 * - Opt in only. The browser is asked for permission when the person presses
 *   "Turn on" on the Desk, never on page load. The per-browser preference can
 *   switch it off again without touching the browser's permission.
 * - One announcement per slip. An arrival goes to the desktop when the person
 *   is away, and to the toast when they are here — never both. Across tabs the
 *   service worker drops the alert if any portal window has focus, and every
 *   alert is tagged by its row so two tabs raising the same slip show one.
 * - Bursts fold, exactly as the toast does: arrivals inside the coalescing
 *   window replace the open alert with "N new updates on the desk".
 * - Clicking focuses the tab and opens the same destination as the inbox row
 *   (`notificationHref`), marking the row read.
 * - Suppliers are alerted for jobs and order changes only; Operations and
 *   Super Admin for every row their inbox receives.
 *
 * Alerts go through a service worker registration (`public/desk-alerts-sw.js`)
 * so a click can still find, focus or reopen the portal; where no worker is
 * available the page raises a plain `Notification` instead. With the browser
 * closed nothing arrives: that needs Web Push, which the API does not send yet.
 */

export const DESKTOP_ALERTS_PREFERENCE_KEY = "gridgo-web.desktop-alerts";
export const DESKTOP_ALERTS_PROMPT_KEY = "gridgo-web.desktop-alerts-prompt";
export const DESKTOP_ALERTS_WORKER_URL = "/desk-alerts-sw.js";
export const DESKTOP_ALERT_SHOW_MESSAGE = "gridgo-desk-alert-show";
export const DESKTOP_ALERT_CLICK_MESSAGE = "gridgo-desk-alert-click";
export const DESKTOP_ALERT_ICON = "/icon.png";
export const DESKTOP_ALERT_BURST_BODY = "Open the bell to read them.";
const WORKER_READY_TIMEOUT_MS = 5_000;
const REMEMBERED_ROWS = 50;

export type DesktopAlertPermission = "unsupported" | "default" | "granted" | "denied";

/**
 * - `unsupported`: this browser (or an insecure origin) has no notifications.
 * - `blocked`: the person, or the browser, denied permission for this site.
 * - `ask`: permission has not been asked for yet.
 * - `on` / `off`: permission granted; the Desk preference decides.
 */
export type DesktopAlertStatus = "unsupported" | "blocked" | "ask" | "on" | "off";

type Preference = "on" | "off" | null;

/* ----------------------------------------------------------------------------
   Permission and preference
   ------------------------------------------------------------------------- */

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function notificationApi(): typeof Notification | null {
  if (typeof window === "undefined") return null;
  if (window.isSecureContext === false) return null;
  const api = (window as { Notification?: typeof Notification }).Notification;
  return typeof api === "function" ? api : null;
}

export function readDesktopAlertPermission(): DesktopAlertPermission {
  const api = notificationApi();
  if (!api) return "unsupported";
  const permission = api.permission;
  return permission === "granted" || permission === "denied" ? permission : "default";
}

function readPreference(): Preference {
  const value = storage()?.getItem(DESKTOP_ALERTS_PREFERENCE_KEY);
  return value === "on" || value === "off" ? value : null;
}

export function desktopAlertStatus(
  permission: DesktopAlertPermission,
  preference: Preference,
): DesktopAlertStatus {
  if (permission === "unsupported") return "unsupported";
  if (permission === "denied") return "blocked";
  if (permission === "default") return "ask";
  return preference === "off" ? "off" : "on";
}

export function readDesktopAlertStatus(): DesktopAlertStatus {
  return desktopAlertStatus(readDesktopAlertPermission(), readPreference());
}

export function readDesktopAlertPromptDismissed(): boolean {
  return storage()?.getItem(DESKTOP_ALERTS_PROMPT_KEY) === "dismissed";
}

type Listener = () => void;
const listeners = new Set<Listener>();
let environmentBound = false;

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function writeStorage(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Private mode or a full store: the change still applies for this page.
  }
}

/** The Desk's on/off switch, once the browser has granted permission. */
export function writeDesktopAlertsEnabled(enabled: boolean): void {
  writeStorage(DESKTOP_ALERTS_PREFERENCE_KEY, enabled ? "on" : "off");
  notifyListeners();
}

/** "Not now" on the one-time prompt. The Desk footer keeps the control. */
export function dismissDesktopAlertPrompt(): void {
  writeStorage(DESKTOP_ALERTS_PROMPT_KEY, "dismissed");
  notifyListeners();
}

/**
 * Status changes arrive from three places: another tab (storage event), the
 * browser's site settings (permission `change`, where supported), and a person
 * coming back to the tab after changing those settings (focus / visibility).
 */
export function subscribeDesktopAlerts(listener: Listener): () => void {
  listeners.add(listener);
  if (!environmentBound && typeof window !== "undefined") {
    environmentBound = true;
    window.addEventListener("storage", (event) => {
      if (
        event.key === null ||
        event.key === DESKTOP_ALERTS_PREFERENCE_KEY ||
        event.key === DESKTOP_ALERTS_PROMPT_KEY
      ) {
        notifyListeners();
      }
    });
    window.addEventListener("focus", notifyListeners);
    document.addEventListener("visibilitychange", notifyListeners);
    try {
      void navigator.permissions
        ?.query({ name: "notifications" as PermissionName })
        .then((state) => state.addEventListener("change", notifyListeners))
        .catch(() => undefined);
    } catch {
      // Older browsers: focus and visibility still pick the change up.
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

function requestPermission(api: typeof Notification): Promise<DesktopAlertPermission> {
  return new Promise((resolve) => {
    const settle = (value: string) =>
      resolve(value === "granted" || value === "denied" ? value : "default");
    try {
      // Older Safari only takes a callback; everyone else returns a promise.
      const pending = api.requestPermission(settle) as Promise<string> | undefined;
      pending?.then(settle, () => settle(api.permission));
    } catch {
      settle(api.permission);
    }
  });
}

/**
 * "Turn on" on the Desk. Asks the browser only while permission is undecided;
 * a granted browser just flips the preference back on. Any answer counts as
 * having seen the one-time prompt.
 */
export async function turnOnDesktopAlerts(): Promise<DesktopAlertStatus> {
  const api = notificationApi();
  if (!api) return "unsupported";
  let permission = readDesktopAlertPermission();
  if (permission === "default") permission = await requestPermission(api);
  writeStorage(DESKTOP_ALERTS_PROMPT_KEY, "dismissed");
  if (permission === "granted") {
    writeStorage(DESKTOP_ALERTS_PREFERENCE_KEY, "on");
    void ensureDesktopAlertWorker();
  }
  notifyListeners();
  return readDesktopAlertStatus();
}

/* ----------------------------------------------------------------------------
   Who gets alerted, and when
   ------------------------------------------------------------------------- */

/**
 * Suppliers: new job offers and changes to their orders (every job row carries
 * its order). Operations and Super Admin: every row their inbox receives.
 */
export function desktopAlertWanted(role: Role, notification: Notification): boolean {
  if (role === "ops_admin" || role === "super_admin") return true;
  if (role !== "supplier") return false;
  const type = notification.type ?? "";
  return (
    Boolean(notification.orderId) ||
    type.startsWith("shop_job") ||
    type.startsWith("supplier_assignment")
  );
}

/** Hidden, or visible behind another window: the toast would go unseen. */
export function pageIsAway(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return true;
  return typeof document.hasFocus === "function" ? !document.hasFocus() : false;
}

/** The route tree a click should prefer, so it lands in the right workspace. */
export function roleTree(role: Role): string {
  if (role === "supplier") return "/supplier/";
  if (role === "ops_admin") return "/ops/";
  if (role === "super_admin") return "/admin/";
  return "/";
}

/* ----------------------------------------------------------------------------
   Raising one
   ------------------------------------------------------------------------- */

export type DesktopAlert = {
  /** One tag per slip (or burst), so two tabs raising it show one alert. */
  tag: string;
  title: string;
  body: string;
  /** Where a click lands; null just focuses the portal. */
  href: string | null;
  notificationId: string | null;
  tree: string;
  /** Show even when a portal window has focus (the turn-on confirmation). */
  force?: boolean;
};

export type DesktopAlertClick = {
  notificationId: string | null;
  href: string | null;
};

export type DesktopAlertSurface = {
  show: (alert: DesktopAlert) => Promise<void>;
};

let workerPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Registers the Desk's service worker once per page. It has no fetch handler:
 * it only raises alerts and routes their clicks. Resolves null (and retries on
 * the next call) where workers are unavailable or registration fails.
 */
export function ensureDesktopAlertWorker(): Promise<ServiceWorkerRegistration | null> {
  if (workerPromise) return workerPromise;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  const pending = (async () => {
    try {
      await navigator.serviceWorker.register(DESKTOP_ALERTS_WORKER_URL, { scope: "/" });
      const ready = await withTimeout(
        navigator.serviceWorker.ready,
        WORKER_READY_TIMEOUT_MS,
      );
      return ready?.active ? ready : null;
    } catch {
      return null;
    }
  })();
  workerPromise = pending;
  void pending.then((registration) => {
    if (!registration && workerPromise === pending) workerPromise = null;
  });
  return pending;
}

/** Test seam: forget the registration so the next call registers again. */
export function resetDesktopAlertWorkerForTests(): void {
  workerPromise = null;
}

/** The click message the service worker posts back, if `data` is one. */
export function readDesktopAlertClick(data: unknown): DesktopAlertClick | null {
  if (!data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message.type !== DESKTOP_ALERT_CLICK_MESSAGE) return null;
  const href = safePortalPath(message.href);
  const notificationId =
    typeof message.notificationId === "string" && message.notificationId
      ? message.notificationId
      : null;
  return { href, notificationId };
}

/** Only same-origin paths; `//host` and absolute URLs are dropped. */
export function safePortalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return null;
  return value;
}

type BrowserSurfaceOptions = {
  /** Page-level fallback click; the worker path posts a message instead. */
  onClick: (click: DesktopAlertClick) => void;
};

export function createBrowserDesktopAlertSurface({
  onClick,
}: BrowserSurfaceOptions): DesktopAlertSurface {
  return {
    async show(alert) {
      const registration = await ensureDesktopAlertWorker();
      if (registration?.active) {
        registration.active.postMessage({ type: DESKTOP_ALERT_SHOW_MESSAGE, alert });
        return;
      }
      // No worker: this tab decides alone. Some browsers (Chrome on Android)
      // only raise notifications through a worker and throw here; the bell
      // and the toast still carry the slip.
      const api = notificationApi();
      if (!api || api.permission !== "granted") return;
      if (!alert.force && typeof document !== "undefined" && document.hasFocus?.())
        return;
      try {
        const note = new api(alert.title, {
          body: alert.body,
          tag: alert.tag,
          icon: DESKTOP_ALERT_ICON,
          silent: true,
        });
        note.onclick = () => {
          window.focus();
          note.close();
          onClick({ href: alert.href, notificationId: alert.notificationId });
        };
      } catch {
        // Unsupported constructor: degrade to the in-tab signals.
      }
    },
  };
}

/** Shown once, right after the browser grants permission, so the person sees one. */
export function desktopAlertsOnConfirmation(role: Role): DesktopAlert {
  return {
    tag: "gridgo-desk-alerts-on",
    title: "Desktop alerts are on",
    body: `${capitalise(desktopAlertScope(role))} will show here while GRIDGO is in another tab or window.`,
    href: null,
    notificationId: null,
    tree: roleTree(role),
    force: true,
  };
}

/** What a role is alerted about, in the words the Desk uses. */
export function desktopAlertScope(role: Role): string {
  return role === "supplier" ? "new jobs and order updates" : "new slips";
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ----------------------------------------------------------------------------
   The announcer the live provider drives
   ------------------------------------------------------------------------- */

export type DesktopAnnouncer = {
  /**
   * Raise a desktop alert for this fresh slip if the person is away and wants
   * one. True when it went to the desktop, so the toast stays quiet.
   */
  announce: (notification: Notification) => boolean;
  /** A slip this tab raised, so a click can open it like an inbox row. */
  rowFor: (notificationId: string) => Notification | undefined;
  dispose: () => void;
};

type AnnouncerOptions = {
  role: Role;
  surface: DesktopAlertSurface;
  readStatus?: () => DesktopAlertStatus;
  isAway?: () => boolean;
  coalesceMs?: number;
  now?: () => number;
};

export function createDesktopAnnouncer({
  role,
  surface,
  readStatus = readDesktopAlertStatus,
  isAway = pageIsAway,
  coalesceMs = ARRIVAL_TOAST_COALESCE_MS,
  now = () => Date.now(),
}: AnnouncerOptions): DesktopAnnouncer {
  let burst: { tag: string; count: number; startedAt: number } | null = null;
  const rows = new Map<string, Notification>();
  const tree = roleTree(role);

  const remember = (notification: Notification) => {
    rows.delete(notification.id);
    rows.set(notification.id, notification);
    if (rows.size > REMEMBERED_ROWS) {
      const oldest = rows.keys().next().value;
      if (oldest !== undefined) rows.delete(oldest);
    }
  };

  const raise = (alert: DesktopAlert) => {
    void surface.show(alert).catch(() => undefined);
  };

  return {
    announce(notification) {
      if (readStatus() !== "on") return false;
      if (!desktopAlertWanted(role, notification)) return false;
      if (!isAway()) return false;
      remember(notification);
      const at = now();
      if (burst && at - burst.startedAt <= coalesceMs) {
        burst.count += 1;
        // Same tag as the open alert, so the burst replaces it in place.
        raise({
          tag: burst.tag,
          title: burstTitle(burst.count),
          body: DESKTOP_ALERT_BURST_BODY,
          href: null,
          notificationId: null,
          tree,
        });
        return true;
      }
      const tag = `gridgo-desk:${notification.id}`;
      burst = { tag, count: 1, startedAt: at };
      raise({
        tag,
        title: notification.title,
        body: notification.body,
        href: notificationHref(role, notification),
        notificationId: notification.id,
        tree,
      });
      return true;
    },
    rowFor(notificationId) {
      return rows.get(notificationId);
    },
    dispose() {
      burst = null;
      rows.clear();
    },
  };
}
