// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Announcement } from "@/lib/api/types";

const { postAnnouncementMock } = vi.hoisted(() => ({
  postAnnouncementMock: vi.fn(),
}));

vi.stubGlobal("React", React);

// Base UI radios dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    postAnnouncement: postAnnouncementMock,
  };
});

import AdminBroadcastPage from "@/app/admin/broadcast/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function sent(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: "anc_test",
    audience: "suppliers",
    title: "Pickup window changes tomorrow",
    body: "Jobs after 4pm pickup the next morning.",
    at: "2026-08-13T02:00:00.000Z",
    notifiedUsers: 4,
    unclaimedDevices: 0,
    ...overrides,
  };
}

describe("AdminBroadcastPage", () => {
  it("does not pre-select an audience, and lists Everyone last", () => {
    render(<AdminBroadcastPage />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    for (const radio of radios) {
      expect(radio).not.toBeChecked();
    }
    expect(radios.at(-1)).toHaveAccessibleName(/Everyone/);
    expect(screen.getByText(/never signed in/)).toBeInTheDocument();
  });

  it("offers no destination URL field and does not ask for a phone count", () => {
    render(<AdminBroadcastPage />);

    expect(screen.queryByLabelText(/^Link$/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/talasora\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Count again/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/registered for notifications/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(/no link on the lock screen/i).length,
    ).toBeGreaterThan(0);
  });

  it("holds Review until who, title and message are filled", async () => {
    const user = userEvent.setup();
    render(<AdminBroadcastPage />);

    const review = screen.getByRole("button", { name: "Review and send" });
    expect(review).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Print shops/ }));
    await user.type(screen.getByLabelText("Title"), "Pickup window changes tomorrow");
    expect(review).toBeDisabled();

    await user.type(
      screen.getByLabelText("Message"),
      "Jobs after 4pm pickup the next morning.",
    );
    expect(review).toBeEnabled();
  });

  it("restates audience and wording in confirmation, then posts /announcements", async () => {
    postAnnouncementMock.mockResolvedValueOnce(sent());
    const user = userEvent.setup();
    render(<AdminBroadcastPage />);

    await user.click(screen.getByRole("radio", { name: /Print shops/ }));
    await user.type(screen.getByLabelText("Title"), "Pickup window changes tomorrow");
    await user.type(
      screen.getByLabelText("Message"),
      "Jobs after 4pm pickup the next morning.",
    );
    await user.click(screen.getByRole("button", { name: "Review and send" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Send to Print shops?")).toBeInTheDocument();
    expect(within(dialog).getByText(/print shops only/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText("Pickup window changes tomorrow"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/Are you sure/i)).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Send to Print shops" }),
    );

    expect(postAnnouncementMock).toHaveBeenCalledWith({
      audience: "suppliers",
      title: "Pickup window changes tomorrow",
      body: "Jobs after 4pm pickup the next morning.",
    });

    expect(
      await screen.findByRole("status", { name: /Sent to Print shops/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/4 signed-in accounts notified/)).toBeInTheDocument();
  });

  it("makes Everyone name the stranger reach before send", async () => {
    const user = userEvent.setup();
    render(<AdminBroadcastPage />);

    await user.click(screen.getByRole("radio", { name: /Everyone/ }));
    await user.type(screen.getByLabelText("Title"), "GRIDGO 1.4 is available");
    await user.type(
      screen.getByLabelText("Message"),
      "Update from the store. Open the GRIDGO app to install it.",
    );

    expect(screen.getByText(/Reaches strangers/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review and send" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/never signed in/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Type EVERYONE/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send to Everyone" }),
    ).toBeDisabled();
  });
});
