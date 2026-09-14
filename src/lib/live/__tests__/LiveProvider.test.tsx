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
vi.mock("@/lib/api/notifications", () => ({
  listNotificationInbox: (...args: unknown[]) => list(...args),
  openNotificationStream: (next: NotificationStreamHandlers) => {
    handlers = next;
    return { close: vi.fn(), wake: vi.fn() };
  },
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
      {JSON.stringify(
        inbox.notifications.map((row) => ({ id: row.id, read: row.read })),
      )}
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
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual(
      expected,
    );
    await act(async () => {
      handlers.onNotification(row);
    });
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual(
      expected,
    );
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
  expect(
    inbox.notifications.map((row) => ({ id: row.id, read: row.read })),
  ).toEqual([
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
