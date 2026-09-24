/*
 * GRIDGO Desk alerts worker.
 *
 * Raises the desktop alerts a portal tab asks for and routes their clicks back
 * to the portal. It has no fetch handler: it never touches the network or the
 * page cache. The page side lives in `src/lib/live/desktopAlerts.ts`.
 *
 * Message in:  { type: "gridgo-desk-alert-show", alert }
 * Message out: { type: "gridgo-desk-alert-click", notificationId, href }
 */

const SHOW = "gridgo-desk-alert-show";
const CLICK = "gridgo-desk-alert-click";
const ICON = "/icon.png";

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

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== SHOW) return;
  event.waitUntil(show(data.alert));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(open(event.notification.data));
});
