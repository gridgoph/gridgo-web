/*
 * GRIDGO Desk alerts worker.
 *
 * Raises the desktop alerts a portal tab asks for, shows the Web Push
 * notifications the API sends to an installed supplier app, and routes both
 * kinds of click back to the portal. It has no fetch handler: it never touches
 * the network or the page cache, so no API data is ever stored here. The page
 * side lives in `src/lib/live/desktopAlerts.ts` and `src/lib/pwa/webPush.ts`.
 *
 * Message in:  { type: "gridgo-desk-alert-show", alert }
 * Message out: { type: "gridgo-desk-alert-click", notificationId, href }
 * Push in:     { title, body, data: { notificationId, type, orderId, at }, url }
 */

const SHOW = "gridgo-desk-alert-show";
const CLICK = "gridgo-desk-alert-click";
const ICON = "/icon.png";
const PUSH_ICON = "/pwa/icon-192.png";
const PUSH_BADGE = "/pwa/badge-96.png";
const PUSH_TREE = "/supplier/";
// Opens the slip a push names; the page there works out its destination.
const PUSH_NOTICE = "/supplier/notice";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function portalPath(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return null;
  return value;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

async function portalWindows() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return windows.filter((client) => {
    try {
      return new URL(client.url).origin === self.location.origin;
    } catch {
      return false;
    }
  });
}

async function show(alert) {
  if (!alert || typeof alert !== "object") return;
  const title = text(alert.title);
  const tag = text(alert.tag);
  if (!title || !tag) return;
  if (!alert.force) {
    // Someone is looking at a portal window: its toast and bell carry the slip.
    const windows = await portalWindows();
    if (
      windows.some((client) => client.focused && client.visibilityState === "visible")
    ) {
      return;
    }
  }
  await self.registration.showNotification(title, {
    body: text(alert.body),
    tag,
    icon: ICON,
    silent: true,
    data: {
      href: portalPath(alert.href),
      notificationId: text(alert.notificationId) || null,
      tree: portalPath(alert.tree) || "/",
    },
  });
}

async function open(data) {
  const href = portalPath(data && data.href);
  const tree = portalPath(data && data.tree) || "/";
  const windows = await portalWindows();
  const inTree = windows.filter((client) =>
    new URL(client.url).pathname.startsWith(tree),
  );
  const target =
    inTree.find((client) => client.visibilityState === "visible") ||
    inTree[0] ||
    windows[0];
  if (target) {
    const focused = await target.focus().catch(() => target);
    (focused || target).postMessage({
      type: CLICK,
      notificationId: (data && data.notificationId) || null,
      href,
    });
    return;
  }
  // Every portal tab is gone: open the destination fresh.
  await self.clients.openWindow(href || tree);
}

function readPush(event) {
  if (!event.data) return {};
  try {
    const value = event.data.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

/** The supplier page that opens a pushed slip, or null without a slip id. */
function noticePath(data) {
  const id = text(data.notificationId);
  if (!id) return null;
  const query = new URLSearchParams({ id });
  if (text(data.type)) query.set("type", text(data.type));
  if (text(data.orderId)) query.set("orderId", text(data.orderId));
  return `${PUSH_NOTICE}?${query.toString()}`;
}

/*
 * Every push is shown, even while the app is open: iOS and Chrome both expect a
 * visible notification for each push and may end the subscription otherwise.
 * The tag is the Desk alert's, so a slip already raised by an open tab is
 * replaced in place instead of announced twice.
 */
async function showPush(payload) {
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const title = text(payload.title) || "GRIDGO";
  const notificationId = text(data.notificationId) || null;
  const href = noticePath(data) || portalPath(payload.url) || PUSH_TREE;
  await self.registration.showNotification(title, {
    body: text(payload.body),
    tag: notificationId ? `gridgo-desk:${notificationId}` : "gridgo-push",
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    data: { href, notificationId, tree: PUSH_TREE },
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(readPush(event)));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== SHOW) return;
  event.waitUntil(show(data.alert));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(open(event.notification.data));
});
