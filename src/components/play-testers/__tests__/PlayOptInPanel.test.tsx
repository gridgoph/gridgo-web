// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { PlayOptInSummary, PlayTesterRoster } from "@/lib/api/play-testers";

const { api, nav } = vi.hoisted(() => ({
  api: {
    listPlayTesters: vi.fn(),
    addPlayTester: vi.fn(),
    removePlayTester: vi.fn(),
    updatePlayTesterSettings: vi.fn(),
    markPlayOptedIn: vi.fn(),
    sendPlayOptInBroadcast: vi.fn(),
  },
  nav: { replace: vi.fn(), params: new URLSearchParams() },
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => "/ops/play-testers",
}));
vi.mock("@/lib/api/play-testers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/play-testers")>(
    "@/lib/api/play-testers",
  );
  return { ...actual, ...api };
});

import { PlayTestersDesk } from "@/components/play-testers/PlayTestersDesk";

function optIn(overrides: Partial<PlayOptInSummary> = {}): PlayOptInSummary {
  return {
    campaignEnabled: true,
    target: 12,
    groupMode: "link",
    optInUrl: "https://play.google.com/apps/testing/ph.gridgo.client",
    groupJoinUrl: "https://groups.google.com/g/gridgo-client-testers",
    dailyReminderEnabled: true,
    dailyReminderHour: 10,
    optedInCount: 3,
    detectedPlayCount: 2,
    playConsoleOptedInCount: 5,
    unfinished: [
      {
        userId: "user_cara",
        name: "Cara Lim",
        app: "client",
        gmail: "cara@gmail.com",
        lastStep: "install_from_play",
        at: "2026-11-10T08:00:00.000Z",
      },
      {
        userId: "user_dan",
        name: "Dan Cruz",
        app: "client",
        gmail: null,
        lastStep: "confirm_gmail",
        at: "2026-11-10T07:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

function roster(
  play: Partial<PlayOptInSummary> = {},
  approved: string | null = null,
): PlayTesterRoster {
  return {
    app: "client",
    stats: {
      activeToday: 0,
      fullStreak: 0,
      needed: 12,
      playClockStartDate: null,
      optedInCount: 5,
      productionApprovedAt: approved,
    },
    testers: [],
    playOptIn: optIn(play),
  };
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  api.listPlayTesters.mockResolvedValue(roster());
  api.updatePlayTesterSettings.mockResolvedValue(undefined);
  api.markPlayOptedIn.mockResolvedValue(undefined);
  api.sendPlayOptInBroadcast.mockResolvedValue({
    id: "anc_1",
    audience: "clients",
    title: "Help us launch GRIDGO on Play",
    body: "Help us launch GRIDGO on Play, become a tester.",
    at: "2026-11-10T09:00:00.000Z",
    notifiedUsers: 8,
    unclaimedDevices: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function ready() {
  render(<PlayTestersDesk tree="ops" />);
  await screen.findByText("Opted in on Play");
}

function dialog() {
  return screen.getByRole("alertdialog");
}

describe("Play opt-in campaign", () => {
  it("counts opted in against the target, apart from the Console figure", async () => {
    await ready();
    expect(
      screen.getByLabelText("3 of 12 Client testers opted in on Play"),
    ).toBeInTheDocument();
    expect(screen.getByText("Play Console")).toBeInTheDocument();
    expect(screen.getByText("From Play installs")).toBeInTheDocument();
  });

  it("lists who tapped but did not finish, with Gmail and last step", async () => {
    await ready();
    expect(screen.getAllByText("Cara Lim").length).toBeGreaterThan(0);
    expect(screen.getAllByText("cara@gmail.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opened opt-in").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not confirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tapped").length).toBeGreaterThan(0);
  });

  it("sends a broadcast only after a confirm that shows the words", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    expect(within(dialog()).getByText(/There\s+is no unsend/)).toBeInTheDocument();
    expect(
      within(dialog()).getByText("Help us launch GRIDGO on Play, become a tester."),
    ).toBeInTheDocument();
    expect(api.sendPlayOptInBroadcast).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(api.sendPlayOptInBroadcast).toHaveBeenCalledWith("client"),
    );
    expect(await screen.findByText("Sent to 8 accounts.")).toBeInTheDocument();
  });

  it("explains a refused broadcast in the dialog", async () => {
    api.sendPlayOptInBroadcast.mockRejectedValue(
      new ApiError(409, { error: "group_not_configured" }),
    );
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Send" }));
    expect(
      await within(dialog()).findByText("Add the group link first. Nothing was sent."),
    ).toBeInTheDocument();
  });

  it.each([
    ["a lost connection", new TypeError("Failed to fetch")],
    ["a server error", new ApiError(500, { error: "server_error" })],
    ["a gateway timeout", new ApiError(504, { error: "gateway_timeout" })],
  ])(
    "never says nothing was sent after %s, and keeps a resend behind a warning",
    async (_, err) => {
      api.sendPlayOptInBroadcast.mockRejectedValue(err);
      await ready();
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Send" }));
      expect(
        await screen.findByText(/Could not confirm the send\. It may have gone out\./),
      ).toBeInTheDocument();
      // The confirm closed: no resend one tap away.
      await waitFor(() =>
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
      );
      expect(screen.queryByText(/Nothing was sent/)).not.toBeInTheDocument();
      expect(api.sendPlayOptInBroadcast).toHaveBeenCalledTimes(1);
      // Reopening warns before any second send.
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
      expect(
        within(dialog()).getByText(
          "The last send may have gone out. Only send again once you have checked.",
        ),
      ).toBeInTheDocument();
      expect(api.sendPlayOptInBroadcast).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      "campaign_disabled",
      "The campaign is off or production is approved. Nothing was sent.",
    ],
    ["group_not_configured", "Add the group link first. Nothing was sent."],
  ])("says nothing was sent only for a definite refusal (%s)", async (code, copy) => {
    api.sendPlayOptInBroadcast.mockRejectedValue(new ApiError(409, { error: code }));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Send" }));
    expect(await within(dialog()).findByText(copy)).toBeInTheDocument();
    expect(screen.queryByText(/Could not confirm the send/)).not.toBeInTheDocument();
  });

  it.each([
    [{ campaignEnabled: false }, null, "Turn the campaign on first."],
    [{ groupJoinUrl: null }, null, "Add the group link first."],
    [{}, "2026-11-09T00:00:00.000Z", "Production is approved. The campaign is over."],
  ] as const)(
    "holds Send with the reason before the click",
    async (play, approved, why) => {
      api.listPlayTesters.mockResolvedValue(roster(play, approved));
      await ready();
      expect(screen.getByRole("button", { name: "Send broadcast" })).toBeDisabled();
      expect(screen.getByText(why)).toBeInTheDocument();
    },
  );

  it("allows Send without a group link when the API adds members itself", async () => {
    api.listPlayTesters.mockResolvedValue(
      roster({ groupMode: "automatic", groupJoinUrl: null }),
    );
    await ready();
    expect(screen.getByRole("button", { name: "Send broadcast" })).toBeEnabled();
    expect(screen.getByText("Added for them")).toBeInTheDocument();
  });

  it("marks a row opted in after a confirm, then reloads", async () => {
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Mark opted in" })[0]);
    expect(within(dialog()).getByText(/It cannot be undone/)).toBeInTheDocument();
    expect(api.markPlayOptedIn).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Mark opted in" }));
    await waitFor(() =>
      expect(api.markPlayOptedIn).toHaveBeenCalledWith("client", "user_cara"),
    );
    expect(await screen.findByText("Marked Cara Lim opted in.")).toBeInTheDocument();
    expect(api.listPlayTesters).toHaveBeenCalledTimes(2);
  });

  it("turns the campaign off through a confirm", async () => {
    await ready();
    fireEvent.click(screen.getByRole("switch", { name: "Client opt-in campaign" }));
    expect(
      within(dialog()).getByText("Turn off the Client campaign?"),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Turn off" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        campaignEnabled: false,
      }),
    );
  });

  it("checks the links and target before saving", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Google Group join link" }));
    const group = screen.getByLabelText("Google Group join link");
    fireEvent.change(group, { target: { value: "http://groups.google.com/g/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Use the Google Group link: https://groups.google.com/g/…"),
    ).toBeInTheDocument();
    expect(api.updatePlayTesterSettings).not.toHaveBeenCalled();
    fireEvent.change(group, {
      target: { value: "https://groups.google.com/g/new-testers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        groupJoinUrl: "https://groups.google.com/g/new-testers",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit opt-in target" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit opt-in target" }));
    const target = screen.getByLabelText("Opt-in target");
    fireEvent.change(target, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Enter a whole number from 1 to 10,000."),
    ).toBeInTheDocument();
    fireEvent.change(target, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", { target: 20 }),
    );
  });

  it("clears the group link when the field is emptied", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Google Group join link" }));
    fireEvent.change(screen.getByLabelText("Google Group join link"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        groupJoinUrl: null,
      }),
    );
  });

  it("loads the daily reminder with its Manila time and the one-send rule", async () => {
    await ready();
    expect(screen.getByRole("switch", { name: "Client daily reminder" })).toBeChecked();
    expect(screen.getByText("10:00 AM (Manila)")).toBeInTheDocument();
    expect(
      screen.getByText(/once a day at this time while the campaign is on/),
    ).toBeInTheDocument();
    expect(screen.getByText(/A manual broadcast\s+counts toward/)).toBeInTheDocument();
  });

  it("turns the daily reminder off, sending only that field", async () => {
    await ready();
    fireEvent.click(screen.getByRole("switch", { name: "Client daily reminder" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        dailyReminderEnabled: false,
      }),
    );
    expect(api.updatePlayTesterSettings).toHaveBeenCalledTimes(1);
    // The campaign switch is untouched and nothing was sent.
    expect(api.sendPlayOptInBroadcast).not.toHaveBeenCalled();
    expect(api.listPlayTesters).toHaveBeenCalledTimes(2);
  });

  it("turns an off reminder back on", async () => {
    api.listPlayTesters.mockResolvedValue(roster({ dailyReminderEnabled: false }));
    await ready();
    const toggle = screen.getByRole("switch", { name: "Client daily reminder" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        dailyReminderEnabled: true,
      }),
    );
  });

  it("changes the reminder hour, sending only the hour", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit daily reminder time" }));
    const hour = screen.getByLabelText("Daily reminder time (Manila)") as HTMLSelectElement;
    expect(hour.value).toBe("10");
    expect(hour.options).toHaveLength(24);
    expect(screen.getByRole("option", { name: "12:00 AM (Manila)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "11:00 PM (Manila)" })).toBeInTheDocument();
    fireEvent.change(hour, { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        dailyReminderHour: 18,
      }),
    );
    expect(api.updatePlayTesterSettings).toHaveBeenCalledTimes(1);
  });

  it("closes the hour editor without a write when the hour is unchanged", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit daily reminder time" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("button", { name: "Edit daily reminder time" }),
    ).toBeInTheDocument();
    expect(api.updatePlayTesterSettings).not.toHaveBeenCalled();
  });

  it("explains a refused reminder hour", async () => {
    api.updatePlayTesterSettings.mockRejectedValue(
      new ApiError(400, { error: "invalid_daily_reminder_hour" }),
    );
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit daily reminder time" }));
    fireEvent.change(screen.getByLabelText("Daily reminder time (Manila)"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Choose an hour from 12:00 AM to 11:00 PM."),
    ).toBeInTheDocument();
  });

  it("hides the daily reminder on an API without it", async () => {
    api.listPlayTesters.mockResolvedValue(
      roster({ dailyReminderEnabled: undefined, dailyReminderHour: undefined }),
    );
    await ready();
    expect(screen.getByRole("switch", { name: "Client opt-in campaign" })).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Client daily reminder" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/A manual broadcast/)).not.toBeInTheDocument();
  });

  it("hides the campaign on an API without it", async () => {
    const old = roster();
    delete old.playOptIn;
    api.listPlayTesters.mockResolvedValue(old);
    render(<PlayTestersDesk tree="ops" />);
    await screen.findByText("No Client testers yet");
    expect(screen.queryByText("Opted in on Play")).not.toBeInTheDocument();
  });
});
