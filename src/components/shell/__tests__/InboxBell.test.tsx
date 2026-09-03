// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InboxBell } from "@/components/shell/InboxBell";
import type { Notification } from "@/lib/api/types";

const { liveRef, pushMock } = vi.hoisted(() => ({
  liveRef: {
    current: {
      notifications: [] as Notification[],
      unreadCount: 0,
      snapshot: null as string | null,
      live: true,
      subscribe: () => () => undefined,
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      refreshInbox: vi.fn(async () => undefined),
    },
  },
  pushMock: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock("@/lib/live/LiveProvider", () => ({
  useLive: () => liveRef.current,
}));

function mockMatchMedia(width = 1280) {
  Object.defineProperty(window, "innerWidth", { writable: true, value: width });
  window.matchMedia = ((query: string) => ({
    matches: width < 768,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function note(partial: Partial<Notification> = {}): Notification {
  return {
    id: "ntf_1",
    userId: "user_ops",
    title: "Payment submitted",
    body: "A shop sent QR proof.",
    read: false,
    at: "2026-09-03T11:48:00.000Z",
    orderId: "ord_9",
    ...partial,
  };
}

function resetLive(next: Partial<(typeof liveRef)["current"]> = {}) {
  liveRef.current = {
    notifications: [],
    unreadCount: 0,
    snapshot: null,
    live: true,
    subscribe: () => () => undefined,
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    refreshInbox: vi.fn(async () => undefined),
    ...next,
  };
}

beforeEach(() => {
  mockMatchMedia();
  resetLive();
  pushMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("InboxBell", () => {
  it("renders a real button trigger", () => {
    render(<InboxBell role="ops_admin" />);
    const trigger = screen.getByRole("button", { name: "Notifications" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("data-slot", "inbox-bell");
  });

  it("shows an unread count on the trigger", () => {
    resetLive({
      unreadCount: 2,
      notifications: [
        note(),
        note({ id: "ntf_2", title: "Job assigned", read: false }),
      ],
    });
    render(<InboxBell role="ops_admin" />);
    const trigger = screen.getByRole("button", {
      name: "Notifications, 2 unread",
    });
    expect(trigger).toHaveTextContent("2");
  });

  it("opens the notifications panel on click", async () => {
    const user = userEvent.setup();
    resetLive({
      unreadCount: 1,
      notifications: [note()],
    });
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(await screen.findByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Payment submitted")).toBeInTheDocument();
    expect(screen.getByText("A shop sent QR proof.")).toBeInTheDocument();
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("invites the next slip when the inbox is empty", async () => {
    const user = userEvent.setup();
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByText("New jobs and payments will land here")).toBeInTheDocument();
  });

  it("marks a slip read and opens its job", async () => {
    const user = userEvent.setup();
    const markRead = vi.fn(async () => undefined);
    resetLive({
      unreadCount: 1,
      notifications: [note()],
      markRead,
    });
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(await screen.findByRole("button", { name: /Payment submitted/ }));
    expect(markRead).toHaveBeenCalledWith("ntf_1");
    expect(pushMock).toHaveBeenCalledWith("/ops/orders/ord_9");
  });
});
