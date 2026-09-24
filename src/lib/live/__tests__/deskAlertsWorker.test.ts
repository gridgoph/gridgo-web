import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

import {
  DESKTOP_ALERT_CLICK_MESSAGE,
  DESKTOP_ALERT_SHOW_MESSAGE,
  DESKTOP_ALERTS_WORKER_URL,
} from "../desktopAlerts";

const source = readFileSync(
  path.resolve(__dirname, "../../../../public", DESKTOP_ALERTS_WORKER_URL.slice(1)),
  "utf8",
);

type FakeClient = {
  url: string;
  focused: boolean;
  visibilityState: "visible" | "hidden";
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};

function client(
  url: string,
  state: Partial<Pick<FakeClient, "focused" | "visibilityState">> = {},
): FakeClient {
  const next: FakeClient = {
    url: `https://portal.test${url}`,
    focused: state.focused ?? false,
    visibilityState: state.visibilityState ?? "hidden",
    focus: vi.fn(),
    postMessage: vi.fn(),
  };
  next.focus.mockImplementation(async () => next);
  return next;
}

function loadWorker(windows: FakeClient[]) {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: "https://portal.test" },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow,
      claim: vi.fn(async () => undefined),
    },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, handler);
    },
  };
  vm.runInNewContext(source, { self, URL });
  async function dispatch(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  }
  return { dispatch, showNotification, openWindow };
}

const alert = {
  tag: "gridgo-desk:n1",
  title: "Payment submitted",
  body: "Confirm the transfer",
  href: "/ops/orders/ord_1",
  notificationId: "n1",
  tree: "/ops/",
};

it("raises the alert silently with the row's deep link while no portal window has focus", async () => {
  const worker = loadWorker([client("/ops/orders")]);
  await worker.dispatch("message", { data: { type: DESKTOP_ALERT_SHOW_MESSAGE, alert } });
  expect(worker.showNotification).toHaveBeenCalledWith("Payment submitted", {
    body: "Confirm the transfer",
    tag: "gridgo-desk:n1",
    icon: "/icon.png",
    silent: true,
    data: { href: "/ops/orders/ord_1", notificationId: "n1", tree: "/ops/" },
  });
});

it("drops the alert when another portal tab has focus (its toast carries the slip)", async () => {
  const worker = loadWorker([
    client("/ops/orders"),
    client("/ops/dispatch", { focused: true, visibilityState: "visible" }),
  ]);
  await worker.dispatch("message", { data: { type: DESKTOP_ALERT_SHOW_MESSAGE, alert } });
  expect(worker.showNotification).not.toHaveBeenCalled();
  await worker.dispatch("message", {
    data: { type: DESKTOP_ALERT_SHOW_MESSAGE, alert: { ...alert, force: true } },
  });
  expect(worker.showNotification).toHaveBeenCalledTimes(1);
});

it("ignores unrelated messages and strips foreign destinations", async () => {
  const worker = loadWorker([]);
  await worker.dispatch("message", { data: { type: "other", alert } });
  await worker.dispatch("message", { data: null });
  expect(worker.showNotification).not.toHaveBeenCalled();
  await worker.dispatch("message", {
    data: {
      type: DESKTOP_ALERT_SHOW_MESSAGE,
      alert: { ...alert, href: "https://evil.test", tree: "//evil.test" },
    },
  });
  expect(worker.showNotification).toHaveBeenCalledWith(
    "Payment submitted",
    expect.objectContaining({
      data: { href: null, notificationId: "n1", tree: "/" },
    }),
  );
});

it("focuses a tab in the alert's workspace and hands it the row", async () => {
  const supplierTab = client("/supplier/jobs");
  const opsTab = client("/ops/orders");
  const worker = loadWorker([supplierTab, opsTab]);
  const close = vi.fn();
  await worker.dispatch("notificationclick", {
    notification: {
      close,
      data: { href: "/ops/orders/ord_1", notificationId: "n1", tree: "/ops/" },
    },
  });
  expect(close).toHaveBeenCalled();
  expect(supplierTab.focus).not.toHaveBeenCalled();
  expect(opsTab.focus).toHaveBeenCalled();
  expect(opsTab.postMessage).toHaveBeenCalledWith({
    type: DESKTOP_ALERT_CLICK_MESSAGE,
    notificationId: "n1",
    href: "/ops/orders/ord_1",
  });
  expect(worker.openWindow).not.toHaveBeenCalled();
});

it("opens the destination fresh when every portal tab is gone", async () => {
  const worker = loadWorker([]);
  await worker.dispatch("notificationclick", {
    notification: {
      close: vi.fn(),
      data: { href: "/supplier/jobs/ord_1", notificationId: "n1", tree: "/supplier/" },
    },
  });
  expect(worker.openWindow).toHaveBeenCalledWith("/supplier/jobs/ord_1");
});

it("opens the workspace for a burst alert with no single row", async () => {
  const worker = loadWorker([]);
  await worker.dispatch("notificationclick", {
    notification: {
      close: vi.fn(),
      data: { href: null, notificationId: null, tree: "/admin/" },
    },
  });
  expect(worker.openWindow).toHaveBeenCalledWith("/admin/");
});
