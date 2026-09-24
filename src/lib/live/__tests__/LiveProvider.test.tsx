// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveProvider, useLive, type LiveContextValue } from "../LiveProvider";
import { useLiveReload } from "../useLiveReload";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type NotificationStreamHandlers,
} from "@/lib/api/notifications";
import type { Notification } from "@/lib/api/types";
vi.stubGlobal("React", React);
let handlers: NotificationStreamHandlers;
let currentUser = { id: "a" };
const list = vi.fn();
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: currentUser, refresh: vi.fn() }),
}));
vi.mock("@/lib/api/client", () => ({ getAuthToken: async () => "token" }));
const chime = vi.hoisted(() => ({ play: vi.fn(), dispose: vi.fn() }));
vi.mock("@/lib/live/notificationSound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/live/notificationSound")>()),
  notificationChime: () => chime,
}));
const toastManager = vi.hoisted(() => ({
  add: vi.fn<(options: unknown) => string>(() => "toast_1"),
  update: vi.fn<(id: string, options: unknown) => void>(),
}));
vi.mock("@/components/ui/toast", () => ({ toast: toastManager }));
const streamHandle = vi.hoisted(() => ({ close: vi.fn(), wake: vi.fn() }));
vi.mock("@/lib/api/notifications", () => ({
  listNotificationInbox: (...args: unknown[]) => list(...args),
  openNotificationStream: (next: NotificationStreamHandlers) => {
    handlers = next;
    return { ...streamHandle, isLive: () => false };
  },
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  chime.play.mockReset();
  toastManager.add.mockClear();
  toastManager.update.mockClear();
  streamHandle.wake.mockClear();
  window.localStorage.clear();
  currentUser = { id: "a" };
  list.mockReset();
  vi.mocked(markNotificationRead).mockReset();
  vi.mocked(markAllNotificationsRead).mockReset();
  vi.mocked(deleteNotification).mockReset();
});
function Orders() {
  const [state, setState] = useState("awaiting payment");
  useLiveReload("orders", async () => {
    setState("confirmed");
  });
  return <p>{state}</p>;
}
function Inbox() {
  return (
    <p>
      {useLive()
        .notifications.map((n) => n.title)
        .join(",")}
    </p>
  );
}
it("keeps the visible order refresh when notification and invalidate arrive together", async () => {
  list.mockResolvedValue({ notifications: [], snapshot: null });
  render(
    <LiveProvider>
      <Orders />
    </LiveProvider>,
  );
  await waitFor(() => expect(handlers).toBeDefined());
  await act(async () => {
    handlers.onNotification({ id: "n", title: "Paid" } as never);
    handlers.onInvalidate({ resource: "orders" });
  });
  await waitFor(() => expect(screen.getByText("confirmed")).toBeTruthy());
});
it("reconciles the visible order immediately after a short reconnect", async () => {
  list.mockResolvedValue({ notifications: [], snapshot: null });
  render(
    <LiveProvider>
      <Orders />
    </LiveProvider>,
  );
  await waitFor(() => expect(handlers).toBeDefined());
  await act(async () => {
    handlers.onStatus?.(true);
  });
  await waitFor(() => expect(screen.getByText("confirmed")).toBeTruthy());
});
it("does not restore the old inbox when an old account read resolves late", async () => {
  let resolve!: (value: unknown) => void;
  list
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue({ notifications: [], snapshot: null });
  const view = render(
    <LiveProvider>
      <Inbox />
    </LiveProvider>,
  );
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  currentUser = { id: "b" };
  view.rerender(
    <LiveProvider>
      <Inbox />
    </LiveProvider>,
  );
  await act(async () => {
    resolve({
      notifications: [{ id: "old", title: "Private A" }],
      snapshot: "old",
    });
  });
  expect(screen.queryByText("Private A")).toBeNull();
});

let inbox: LiveContextValue;
function MutationInbox() {
  inbox = useLive();
  return (
    <output>
      {JSON.stringify(inbox.notifications.map((row) => ({ id: row.id, read: row.read })))}
    </output>
  );
}
function notification(id: string): Notification {
  return {
    id,
    userId: "a",
    title: id,
    body: "",
    read: false,
    at: "2026-09-15T00:00:00Z",
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

it.each(["read", "all", "delete"] as const)(
  "keeps a successful %s across a stale fetch and stream replay",
  async (mutation) => {
    const fetch = deferred<{
      notifications: Notification[];
      snapshot: string;
    }>();
    const row = notification("n");
    list.mockReturnValueOnce(fetch.promise);
    vi.mocked(markNotificationRead).mockResolvedValue({ ...row, read: true });
    vi.mocked(markAllNotificationsRead).mockResolvedValue(1);
    vi.mocked(deleteNotification).mockResolvedValue(undefined);
    render(
      <LiveProvider>
        <MutationInbox />
      </LiveProvider>,
    );
    await act(async () => {
      handlers.onNotification(row);
    });
    await act(async () => {
      if (mutation === "read") await inbox.markRead(row.id);
      else if (mutation === "all") await inbox.markAllRead();
      else await inbox.remove(row.id);
    });
    await act(async () => {
      fetch.resolve({ notifications: [row], snapshot: row.id });
    });
    const expected = mutation === "delete" ? [] : [{ id: "n", read: true }];
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual(expected);
    await act(async () => {
      handlers.onNotification(row);
    });
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual(expected);
    expect(inbox.unreadCount).toBe(0);
  },
);

it("leaves arrivals after a read-all cursor unread during reconciliation", async () => {
  const first = notification("first");
  const later = notification("later");
  list.mockResolvedValueOnce({ notifications: [first], snapshot: first.id });
  const pendingRead = deferred<number>();
  vi.mocked(markAllNotificationsRead).mockReturnValueOnce(pendingRead.promise);
  render(
    <LiveProvider>
      <MutationInbox />
    </LiveProvider>,
  );
  await waitFor(() => expect(inbox.notifications).toHaveLength(1));
  const pendingFetch = deferred<{
    notifications: Notification[];
    snapshot: string;
  }>();
  list.mockReturnValueOnce(pendingFetch.promise);
  let refreshing!: Promise<void>;
  let marking!: Promise<void>;
  await act(async () => {
    refreshing = inbox.refreshInbox();
    marking = inbox.markAllRead();
    handlers.onNotification(later);
  });
  await act(async () => {
    pendingRead.resolve(1);
    await marking;
  });
  await act(async () => {
    pendingFetch.resolve({ notifications: [first], snapshot: first.id });
    await refreshing;
  });
  expect(inbox.notifications.map((row) => ({ id: row.id, read: row.read }))).toEqual([
    { id: "later", read: false },
    { id: "first", read: true },
  ]);
  expect(inbox.unreadCount).toBe(1);
});

it("does not apply a failed inbox mutation", async () => {
  const row = notification("n");
  list.mockResolvedValue({ notifications: [row], snapshot: row.id });
  vi.mocked(markNotificationRead).mockRejectedValueOnce(new Error("Offline"));
  render(
    <LiveProvider>
      <MutationInbox />
    </LiveProvider>,
  );
  await waitFor(() => expect(inbox.notifications).toHaveLength(1));
  await act(async () => {
    await expect(inbox.markRead(row.id)).rejects.toThrow("Offline");
    await inbox.refreshInbox();
  });
  expect(inbox.unreadCount).toBe(1);
});

it("accepts authoritative inbox changes fetched after a completed mutation", async () => {
  const row = notification("n");
  list.mockResolvedValue({ notifications: [row], snapshot: row.id });
  vi.mocked(markNotificationRead).mockResolvedValue({ ...row, read: true });
  render(
    <LiveProvider>
      <MutationInbox />
    </LiveProvider>,
  );
  await waitFor(() => expect(inbox.notifications).toHaveLength(1));
  await act(async () => {
    await inbox.markRead(row.id);
  });
  expect(inbox.unreadCount).toBe(0);
  await act(async () => {
    await inbox.refreshInbox();
  });
  expect(inbox.unreadCount).toBe(1);
});

it("chimes once for fresh unread arrivals and never for replayed or read rows", async () => {
  const fresh = () => new Date().toISOString();
  const existing = { ...notification("existing"), at: fresh() };
  const before = deferred<{ notifications: Notification[]; snapshot: string }>();
  list.mockReturnValueOnce(before.promise);
  render(
    <LiveProvider>
      <MutationInbox />
    </LiveProvider>,
  );
  await waitFor(() => expect(handlers).toBeDefined());
  // Arrivals before the first inbox fetch lands are page-load history, not news.
  await act(async () => {
    handlers.onNotification({ ...notification("early"), at: fresh() });
  });
  expect(chime.play).not.toHaveBeenCalled();
  await act(async () => {
    before.resolve({ notifications: [existing], snapshot: existing.id });
  });
  // The stream replays what the list already showed.
  await act(async () => {
    handlers.onNotification(existing);
  });
  expect(chime.play).not.toHaveBeenCalled();
  await act(async () => {
    handlers.onNotification({ ...notification("paid"), at: fresh() });
  });
  expect(chime.play).toHaveBeenCalledTimes(1);
  await act(async () => {
    handlers.onNotification({ ...notification("paid"), at: fresh() });
    handlers.onNotification({ ...notification("seen"), at: fresh(), read: true });
    handlers.onNotification({
      ...notification("stale"),
      at: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
  });
  expect(chime.play).toHaveBeenCalledTimes(1);
  window.localStorage.setItem("gridgo-web.notification-sound", "off");
  await act(async () => {
    handlers.onNotification({ ...notification("muted"), at: fresh() });
  });
  expect(chime.play).toHaveBeenCalledTimes(1);
});

it("shows one desk toast per fresh unread arrival, folds a burst, and stays quiet on replay", async () => {
  const fresh = () => new Date().toISOString();
  const existing = { ...notification("existing"), at: fresh() };
  const before = deferred<{ notifications: Notification[]; snapshot: string }>();
  list.mockReturnValueOnce(before.promise);
  const opened: string[] = [];
  vi.mocked(markNotificationRead).mockImplementation(async (id) => ({
    ...notification(id),
    read: true,
  }));
  render(
    <LiveProvider onOpenNotification={(row) => opened.push(row.id)}>
      <MutationInbox />
    </LiveProvider>,
  );
  await waitFor(() => expect(handlers).toBeDefined());
  await act(async () => {
    handlers.onNotification({ ...notification("early"), at: fresh() });
  });
  expect(toastManager.add).not.toHaveBeenCalled();
  await act(async () => {
    before.resolve({ notifications: [existing], snapshot: existing.id });
  });
  await act(async () => {
    handlers.onNotification(existing);
    handlers.onNotification({ ...notification("seen"), at: fresh(), read: true });
  });
  expect(toastManager.add).not.toHaveBeenCalled();
  // Sound off must not silence the slip.
  window.localStorage.setItem("gridgo-web.notification-sound", "off");
  await act(async () => {
    handlers.onNotification({ ...notification("paid"), at: fresh() });
  });
  expect(chime.play).not.toHaveBeenCalled();
  expect(toastManager.add).toHaveBeenCalledTimes(1);
  const slip = toastManager.add.mock.calls[0][0] as unknown as {
    type: string;
    data: { notification: Notification };
    actionProps?: { onClick?: () => void };
  };
  expect(slip.type).toBe("arrival");
  expect(slip.data.notification.id).toBe("paid");
  // Two more inside the coalescing window fold into the open toast.
  await act(async () => {
    handlers.onNotification({ ...notification("packed"), at: fresh() });
    handlers.onNotification({ ...notification("assigned"), at: fresh() });
  });
  expect(toastManager.add).toHaveBeenCalledTimes(1);
  expect(toastManager.update).toHaveBeenCalledTimes(2);
  expect(toastManager.update.mock.calls[1][1] as object).toMatchObject({
    type: "arrival-burst",
    title: "3 new updates on the desk",
  });
  // Open marks the row read and hands navigation to the shell.
  await act(async () => {
    slip.actionProps?.onClick?.();
  });
  expect(opened).toEqual(["paid"]);
  await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith("paid", true));
});

it("reconciles the inbox on return to the tab without dropping a healthy stream", async () => {
  list.mockResolvedValue({ notifications: [], snapshot: null });
  render(
    <LiveProvider>
      <Inbox />
    </LiveProvider>,
  );
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // The handle decides whether a reconnect is needed; the provider only asks.
  expect(streamHandle.wake).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});

it("sends a fresh slip to the desktop while the person is away, and to the toast while they are here", async () => {
  const fresh = () => new Date().toISOString();
  const created: Array<{ title: string; onclick: (() => void) | null }> = [];
  class GrantedNotification {
    static permission = "granted";
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(public title: string) {
      created.push(this);
    }
  }
  vi.stubGlobal("Notification", GrantedNotification);
  const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  vi.spyOn(window, "focus").mockImplementation(() => undefined);
  vi.mocked(markNotificationRead).mockImplementation(async (id) => ({
    ...notification(id),
    read: true,
  }));
  list.mockResolvedValue({ notifications: [], snapshot: null });
  const opened: string[] = [];
  try {
    render(
      <LiveProvider role="ops_admin" onOpenNotification={(row) => opened.push(row.id)}>
        <MutationInbox />
      </LiveProvider>,
    );
    await waitFor(() => expect(handlers).toBeDefined());
    await waitFor(() => expect(list).toHaveBeenCalled());
    await act(async () => {
      handlers.onNotification({ ...notification("away"), at: fresh() });
    });
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0].title).toBe("away");
    expect(toastManager.add).not.toHaveBeenCalled();
    // Clicking the alert opens the row the way the inbox would.
    await act(async () => {
      created[0].onclick?.();
    });
    expect(opened).toEqual(["away"]);
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith("away", true));

    hasFocus.mockReturnValue(true);
    await act(async () => {
      handlers.onNotification({ ...notification("here"), at: fresh() });
    });
    expect(toastManager.add).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);

    // Switched off on the Desk: the toast carries it even while away.
    hasFocus.mockReturnValue(false);
    window.localStorage.setItem("gridgo-web.desktop-alerts", "off");
    await act(async () => {
      handlers.onNotification({
        ...notification("muted"),
        at: new Date(Date.now() + 5_000).toISOString(),
      });
    });
    expect(created).toHaveLength(1);
    expect(
      toastManager.add.mock.calls.length + toastManager.update.mock.calls.length,
    ).toBe(2);
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.stubGlobal("React", React);
  }
});
