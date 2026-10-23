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

const chime = vi.hoisted(() => ({ play: vi.fn(), dispose: vi.fn() }));
vi.mock("@/lib/live/notificationSound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/live/notificationSound")>()),
  notificationChime: () => chime,
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
  chime.play.mockReset();
  window.localStorage.clear();
});

describe("InboxBell", () => {
  it("lets a shop delete a notice only after confirming, and keeps it on Keep", async () => {
    const user = userEvent.setup();
    const remove = vi.fn<(id: string) => Promise<void>>(async () => undefined);
    resetLive({
      notifications: [note({ id: "ntf_a" }), note({ id: "ntf_b" })],
      unreadCount: 2,
      remove,
    });
    render(<InboxBell role="supplier" />);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(screen.getAllByRole("button", { name: "Delete this notice" })[0]);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Delete this notice?",
    );
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete these" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Delete these 2 notices?",
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(remove.mock.calls.map(([id]) => id)).toEqual(["ntf_a", "ntf_b"]);
  });

  it("offers no delete to staff", async () => {
    const user = userEvent.setup();
    resetLive({ notifications: [note()], unreadCount: 1 });
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(
      screen.queryByRole("button", { name: "Delete this notice" }),
    ).not.toBeInTheDocument();
  });

  it("renders a real button trigger", () => {
    render(<InboxBell role="ops_admin" />);
    const trigger = screen.getByRole("button", { name: "Notifications" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("data-slot", "inbox-bell");
  });

  it("shows an unread count on the trigger", () => {
    resetLive({
      unreadCount: 2,
      notifications: [note(), note({ id: "ntf_2", title: "Job assigned", read: false })],
    });
    render(<InboxBell role="ops_admin" />);
    const trigger = screen.getByRole("button", {
      name: "Notifications, 2 unread",
    });
    const count = trigger.querySelector('[data-slot="inbox-count"]');
    expect(count).not.toBeNull();
    expect(count).toHaveTextContent("2");
    expect(count).toHaveAttribute("aria-hidden", "true");
  });

  it("caps the trigger count at 99+", () => {
    resetLive({ unreadCount: 120, notifications: [note()] });
    render(<InboxBell role="ops_admin" />);
    const trigger = screen.getByRole("button", { name: "Notifications, 99+ unread" });
    expect(trigger.querySelector('[data-slot="inbox-count"]')).toHaveTextContent("99+");
  });

  it("hides the count when nothing is unread", () => {
    resetLive({ unreadCount: 0, notifications: [note({ read: true })] });
    render(<InboxBell role="ops_admin" />);
    const trigger = screen.getByRole("button", { name: "Notifications" });
    expect(trigger.querySelector('[data-slot="inbox-count"]')).toBeNull();
  });

  it("opens the notifications panel on click", async () => {
    const user = userEvent.setup();
    resetLive({
      unreadCount: 1,
      notifications: [note()],
    });
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(await screen.findByRole("heading", { name: "Desk" })).toBeInTheDocument();
    expect(screen.getByText("Floor live")).toBeInTheDocument();
    expect(screen.getByText("Payment submitted")).toBeInTheDocument();
    expect(screen.getByText("A shop sent QR proof.")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="inbox-waiting"]')).toHaveTextContent(
      "1 waiting",
    );
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Payment submitted/ })).toHaveAttribute(
      "data-read",
      "false",
    );
  });

  it("leads with the event and files the order underneath, never a raw id", async () => {
    const user = userEvent.setup();
    resetLive({
      unreadCount: 1,
      notifications: [
        note({
          type: "ops_order_progress",
          title: "Issue window open · ord_c6af26dd9caf",
          body: "The client can still raise an issue.",
          orderId: "ord_c6af26dd9caf",
        }),
      ],
    });
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(await screen.findByText("Issue window open")).toBeInTheDocument();
    expect(screen.getByText("Order ord_c6af26…")).toBeInTheDocument();
    expect(screen.queryByText(/Issue window open · ord_/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Issue window open/ }));
    expect(pushMock).toHaveBeenCalledWith("/ops/orders/ord_c6af26dd9caf");
  });

  it("names the order by its own title when the slip carries one", async () => {
    const user = userEvent.setup();
    resetLive({
      unreadCount: 0,
      notifications: [
        note({
          read: true,
          title: "Shop accepted · ord_9",
          orderTitle: "Business cards, 500 pcs",
        }),
      ],
    });
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Shop accepted")).toBeInTheDocument();
    expect(screen.getByText("Business cards, 500 pcs")).toBeInTheDocument();
    expect(screen.queryByText("Order ord_9")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Shop accepted/ })).toHaveAttribute(
      "data-read",
      "true",
    );
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="inbox-waiting"]')).toHaveTextContent(
      "You're caught up",
    );
    expect(
      screen.queryByRole("button", { name: "Mark all read" }),
    ).not.toBeInTheDocument();
  });

  it("lets the person turn the chime off and back on from the Desk", async () => {
    const user = userEvent.setup();
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    const toggle = await screen.findByRole("button", { name: "Turn sound off" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Turn sound on" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(window.localStorage.getItem("gridgo-web.notification-sound")).toBe("off");
    expect(chime.play).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Turn sound on" }));
    expect(screen.getByRole("button", { name: "Turn sound off" })).toBeInTheDocument();
    expect(window.localStorage.getItem("gridgo-web.notification-sound")).toBe("on");
    expect(chime.play).toHaveBeenCalledTimes(1);
  });

  it("invites the next slip when the inbox is empty", async () => {
    const user = userEvent.setup();
    render(<InboxBell role="ops_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("The desk is clear")).toBeInTheDocument();
    expect(
      screen.getByText("Payments, sign-ups, pickup holds, and shop progress land here"),
    ).toBeInTheDocument();
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

  it("opens a Super Admin order slip on the admin workspace", async () => {
    const user = userEvent.setup();
    const markRead = vi.fn(async () => undefined);
    resetLive({
      unreadCount: 1,
      notifications: [
        note({
          type: "ops_order_progress",
          title: "Shop started printing",
          body: "The press has the job.",
        }),
      ],
      markRead,
    });
    render(<InboxBell role="super_admin" />);
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(await screen.findByText("Shop started printing")).toBeInTheDocument();
    expect(screen.getByText("The press has the job.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Shop started printing/ }));
    expect(markRead).toHaveBeenCalledWith("ntf_1");
    expect(pushMock).toHaveBeenCalledWith("/admin/orders/ord_9");
  });
});

it("shows shop wording and opens the named support conversation", async () => {
  const user = userEvent.setup();
  resetLive({
    notifications: [
      note({
        type: "support_message",
        threadId: "thread two",
        title: "Operations replied",
        body: "Reply text",
      }),
    ],
    unreadCount: 1,
  });
  render(<InboxBell role="supplier" />);
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  await user.click(screen.getByRole("button", { name: /Operations replied/ }));
  expect(pushMock).toHaveBeenCalledWith("/supplier/chat?thread=thread%20two");
});
it("preserves an unknown shop notice's original title and body and uses the jobs list", async () => {
  const user = userEvent.setup();
  resetLive({
    notifications: [
      note({
        type: "older_notice",
        title: "Original update · abc123",
        body: "Original body",
        orderId: "former-job",
      }),
    ],
    unreadCount: 1,
  });
  render(<InboxBell role="supplier" />);
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  await user.click(screen.getByRole("button", { name: /Original update · abc123/ }));
  expect(pushMock).toHaveBeenCalledWith("/supplier/jobs");
});
it("keeps client transfer notices informational for a shop", async () => {
  const user = userEvent.setup();
  resetLive({
    notifications: [
      note({
        type: "refund_unknown",
        title: "Check transfer",
        body: "Client wallet state",
      }),
    ],
    unreadCount: 1,
  });
  render(<InboxBell role="supplier" />);
  await user.click(screen.getByRole("button", { name: /Notifications/ }));
  expect(await screen.findByText(/Nothing changes for your shop/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Client refund update/ }));
  expect(pushMock).not.toHaveBeenCalled();
});
