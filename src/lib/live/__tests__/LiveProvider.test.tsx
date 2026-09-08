// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveProvider, useLive } from "../LiveProvider";
import { useLiveReload } from "../useLiveReload";
import type { NotificationStreamHandlers } from "@/lib/api/notifications";
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
    resolve({ notifications: [{ id: "old", title: "Private A" }], snapshot: "old" });
  });
  expect(screen.queryByText("Private A")).toBeNull();
});
