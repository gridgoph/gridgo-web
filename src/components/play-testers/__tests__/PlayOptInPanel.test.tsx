// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  const actual =
    await vi.importActual<typeof import("@/lib/api/play-testers")>("@/lib/api/play-testers");
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

function roster(play: Partial<PlayOptInSummary> = {}, approved: string | null = null): PlayTesterRoster {
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
    await waitFor(() => expect(api.sendPlayOptInBroadcast).toHaveBeenCalledWith("client"));
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
    [{ campaignEnabled: false }, null, "Turn the campaign on first."],
    [{ groupJoinUrl: null }, null, "Add the group link first."],
    [{}, "2026-11-09T00:00:00.000Z", "Production is approved. The campaign is over."],
  ] as const)("holds Send with the reason before the click", async (play, approved, why) => {
    api.listPlayTesters.mockResolvedValue(roster(play, approved));
    await ready();
    expect(screen.getByRole("button", { name: "Send broadcast" })).toBeDisabled();
    expect(screen.getByText(why)).toBeInTheDocument();
  });

  it("allows Send without a group link when the API adds members itself", async () => {
    api.listPlayTesters.mockResolvedValue(roster({ groupMode: "automatic", groupJoinUrl: null }));
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
    await waitFor(() => expect(api.markPlayOptedIn).toHaveBeenCalledWith("client", "user_cara"));
    expect(await screen.findByText("Marked Cara Lim opted in.")).toBeInTheDocument();
    expect(api.listPlayTesters).toHaveBeenCalledTimes(2);
  });

  it("turns the campaign off through a confirm", async () => {
    await ready();
    fireEvent.click(screen.getByRole("switch", { name: "Client opt-in campaign" }));
    expect(within(dialog()).getByText("Turn off the Client campaign?")).toBeInTheDocument();
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
    fireEvent.change(group, { target: { value: "https://groups.google.com/g/new-testers" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        groupJoinUrl: "https://groups.google.com/g/new-testers",
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit opt-in target" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit opt-in target" }));
    const target = screen.getByLabelText("Opt-in target");
    fireEvent.change(target, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a whole number from 1 to 10,000.")).toBeInTheDocument();
    fireEvent.change(target, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", { target: 20 }),
    );
  });

  it("clears the group link when the field is emptied", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Google Group join link" }));
    fireEvent.change(screen.getByLabelText("Google Group join link"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", { groupJoinUrl: null }),
    );
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
