// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SeasonPushDryRun,
  SeasonWindow,
  SeasonWindowsEnvelope,
} from "@/lib/api/types";

const api = vi.hoisted(() => ({
  listSeasonWindows: vi.fn(),
  getSeasonPushSettings: vi.fn(),
  seasonPushDryRun: vi.fn(),
  createSeasonWindow: vi.fn(),
  updateSeasonWindow: vi.fn(),
  deleteSeasonWindow: vi.fn(),
  updateSeasonPushSettings: vi.fn(),
}));

vi.stubGlobal("React", React);

// Base UI radios and switches dispatch a PointerEvent on click. jsdom has none.
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
  return { ...actual, ...api };
});

import AdminSeasonWindowsPage from "@/app/admin/season-windows/page";

function season(overrides: Partial<SeasonWindow> = {}): SeasonWindow {
  return {
    id: "sea_school",
    name: "School season",
    startDate: "2026-11-13",
    endDate: "2026-11-30",
    demandLevel: "Peak",
    message: "Plan your printing early.",
    status: "upcoming",
    banner: { startDate: "2026-10-02", endDate: "2026-10-16", active: true },
    version: 2,
    noticeQueuedAt: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

function envelope(windows: SeasonWindow[]): SeasonWindowsEnvelope {
  return {
    timeZone: "Asia/Manila",
    today: "2026-10-04",
    awarenessOnly: true,
    windows,
    banners: windows.filter((w) => w.banner.active),
  };
}

const dryRun: SeasonPushDryRun = {
  enabled: false,
  version: 1,
  timeZone: "Asia/Manila",
  today: "2026-10-04",
  eligibleClients: 24,
  eligibleDevices: 30,
  windows: [
    {
      id: "sea_school",
      name: "School season",
      banner: { startDate: "2026-10-02", endDate: "2026-10-16", active: true },
      noticeQueuedAt: null,
      due: true,
      wouldNotifyClients: 24,
      wouldNotifyDevices: 30,
    },
  ],
};

beforeEach(() => {
  api.listSeasonWindows.mockResolvedValue(
    envelope([
      season(),
      season({
        id: "sea_old",
        name: "Graduation 2026",
        startDate: "2026-03-20",
        endDate: "2026-04-10",
        status: "past",
        demandLevel: "Busy",
        banner: { startDate: "2026-02-06", endDate: "2026-02-20", active: false },
      }),
    ]),
  );
  api.getSeasonPushSettings.mockResolvedValue({ enabled: false, version: 1 });
  api.seasonPushDryRun.mockResolvedValue(dryRun);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminSeasonWindowsPage", () => {
  it("lists seasons by status with when the banner shows and what the notice will do", async () => {
    render(<AdminSeasonWindowsPage />);

    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const card = within(upcoming).getByRole("article", { name: "School season" });
    expect(within(card).getByText("Banner showing now, until Fri 16 Oct 2026")).toBeInTheDocument();
    expect(within(card).getByText("Notice held")).toBeInTheDocument();
    expect(
      within(card).getByText(/Turned on now, this would reach 24 clients on 30 phones/),
    ).toBeInTheDocument();

    const past = screen.getByRole("region", { name: /Past/ });
    expect(within(past).getByRole("article", { name: "Graduation 2026" })).toBeInTheDocument();
  });

  it("shows the switch off with the dry-run count, and turning it on asks first", async () => {
    const user = userEvent.setup();
    render(<AdminSeasonWindowsPage />);

    const notices = await screen.findByRole("region", { name: "Pre-season notices" });
    expect(within(notices).getByText("Off")).toBeInTheDocument();
    expect(await within(notices).findByText("24 clients on 30 phones")).toBeInTheDocument();

    const toggle = within(notices).getByRole("switch", { name: "Pre-season notices" });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        /This will notify every client who allowed notifications \(24 clients on 30 phones today\)/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Sends within a minute")).toBeInTheDocument();

    const confirm = within(dialog).getByRole("button", { name: "Turn on notices" });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Keep notices off" }));
    expect(api.updateSeasonPushSettings).not.toHaveBeenCalled();
  });

  it("keeps the switch shut until the count is in", async () => {
    api.seasonPushDryRun.mockReturnValue(new Promise(() => {}));
    render(<AdminSeasonWindowsPage />);

    const notices = await screen.findByRole("region", { name: "Pre-season notices" });
    expect(within(notices).getByText("Counting who would receive it…")).toBeInTheDocument();
    expect(within(notices).getByRole("switch", { name: "Pre-season notices" })).toHaveAttribute(
      "data-disabled",
    );
  });

  it("says the count is missing rather than that nothing is due", async () => {
    const user = userEvent.setup();
    api.seasonPushDryRun.mockRejectedValue(new Error("offline"));
    render(<AdminSeasonWindowsPage />);

    const notices = await screen.findByRole("region", { name: "Pre-season notices" });
    await within(notices).findByText(/Could not count who would receive a notice/);
    await user.click(within(notices).getByRole("switch", { name: "Pre-season notices" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Count unavailable")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Nothing is due today/)).toBeNull();
  });

  it("turns notices on only with a reason, against the version it read", async () => {
    const user = userEvent.setup();
    api.updateSeasonPushSettings.mockResolvedValue({ enabled: true, version: 2 });
    render(<AdminSeasonWindowsPage />);

    const notices = await screen.findByRole("region", { name: "Pre-season notices" });
    await user.click(within(notices).getByRole("switch", { name: "Pre-season notices" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByLabelText("Why"), "First notice approved");
    await user.click(within(dialog).getByRole("button", { name: "Turn on notices" }));

    expect(api.updateSeasonPushSettings).toHaveBeenCalledWith({
      enabled: true,
      expectedVersion: 1,
      reason: "First notice approved",
    });
  });

  it("explains every missing field and does not save an incomplete season", async () => {
    const user = userEvent.setup();
    render(<AdminSeasonWindowsPage />);

    await user.click(await screen.findByRole("button", { name: "Add season window" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Add season" }));

    expect(within(dialog).getByText("Give the season a name clients will recognise.")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose the first day of the season.")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose how busy shops get.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Write the message clients will read. It can't be empty."),
    ).toBeInTheDocument();
    expect(api.createSeasonWindow).not.toHaveBeenCalled();
  });

  it("refuses a last day before the first day", async () => {
    const user = userEvent.setup();
    render(<AdminSeasonWindowsPage />);

    await user.click(await screen.findByRole("button", { name: "Add season window" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("First day"), "2027-03-22");
    await user.type(within(dialog).getByLabelText("Last day"), "2027-03-01");
    await user.click(within(dialog).getByRole("button", { name: "Add season" }));

    expect(
      within(dialog).getByText("The last day can't be before the first day."),
    ).toBeInTheDocument();
    expect(api.createSeasonWindow).not.toHaveBeenCalled();
  });

  it("previews the banner and creates the trimmed season", async () => {
    const user = userEvent.setup();
    api.createSeasonWindow.mockResolvedValue(season({ id: "sea_new" }));
    render(<AdminSeasonWindowsPage />);

    await user.click(await screen.findByRole("button", { name: "Add season window" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), " Graduation season ");
    await user.type(within(dialog).getByLabelText("First day"), "2027-03-22");
    await user.type(within(dialog).getByLabelText("Last day"), "2027-04-10");
    await user.click(within(dialog).getByRole("radio", { name: /Peak/ }));
    await user.type(within(dialog).getByLabelText("Message to clients"), "Order early.");

    // Banner from 42 to 28 days before 22 Mar 2027.
    expect(within(dialog).getByText("Banner shows 8–22 Feb 2027")).toBeInTheDocument();
    expect(within(dialog).getByText("Graduation season starts in 6 weeks")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Add season" }));
    expect(api.createSeasonWindow).toHaveBeenCalledWith({
      name: "Graduation season",
      startDate: "2027-03-22",
      endDate: "2027-04-10",
      demandLevel: "Peak",
      message: "Order early.",
    });
  });

  it("deletes against the version on screen after a confirmation", async () => {
    const user = userEvent.setup();
    api.deleteSeasonWindow.mockResolvedValue(undefined);
    render(<AdminSeasonWindowsPage />);

    await user.click(await screen.findByRole("button", { name: "Delete School season" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete School season?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete season" }));

    expect(api.deleteSeasonWindow).toHaveBeenCalledWith("sea_school", 2);
  });
});
