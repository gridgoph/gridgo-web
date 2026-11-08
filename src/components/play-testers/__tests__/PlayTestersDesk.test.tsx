// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { PlayTester, PlayTesterRoster, TesterDayState } from "@/lib/api/play-testers";

const { api, nav } = vi.hoisted(() => ({
  api: {
    listPlayTesters: vi.fn(),
    addPlayTester: vi.fn(),
    removePlayTester: vi.fn(),
    updatePlayTesterSettings: vi.fn(),
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

function days(states: TesterDayState[]) {
  return states.map((state, i) => ({
    date: `2026-11-${String(i + 1).padStart(2, "0")}`,
    state,
  }));
}

const STRIP: TesterDayState[] = [
  ...Array<TesterDayState>(4).fill("before_start"),
  "checked_in",
  "checked_in",
  "missed",
  ...Array<TesterDayState>(6).fill("checked_in"),
  "today",
];

function tester(overrides: Partial<PlayTester> = {}): PlayTester {
  return {
    userId: "user_ana",
    name: "Ana Reyes",
    email: "ana@example.com",
    role: "client",
    addedAt: "2026-11-01T00:00:00.000Z",
    day: 7,
    streak: 6,
    lastCheckInDate: "2026-11-13",
    latestVersion: "1.2.3 (45)",
    stoppedCheckingIn: false,
    days: days(STRIP),
    feedback: { shownCount: 2, tappedAt: null, dismissedCount: 1 },
    ...overrides,
  };
}

function roster(overrides: Partial<PlayTesterRoster> = {}): PlayTesterRoster {
  return {
    app: "client",
    stats: {
      activeToday: 1,
      fullStreak: 3,
      needed: 12,
      playClockStartDate: null,
      optedInCount: 13,
      productionApprovedAt: null,
    },
    testers: [tester()],
    ...overrides,
  };
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  api.listPlayTesters.mockResolvedValue(roster());
  api.addPlayTester.mockResolvedValue(undefined);
  api.removePlayTester.mockResolvedValue(undefined);
  api.updatePlayTesterSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function ready() {
  render(<PlayTestersDesk tree="ops" />);
  await screen.findAllByText("Ana Reyes");
}

describe("PlayTestersDesk", () => {
  it("reads the chosen app and draws stats, the 14 days and feedback", async () => {
    await ready();
    expect(api.listPlayTesters).toHaveBeenCalledWith("client");
    expect(
      screen.getByLabelText("3 of 12 testers finished 14 straight days"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Last 14 days: 8 checked in, 1 missed, today not yet").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Streak 6").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v1.2.3 (45)").length).toBeGreaterThan(0);
    const feedback = screen.getAllByLabelText(
      "Feedback card shown 2 times, not tapped, dismissed 1",
    );
    expect(feedback.length).toBeGreaterThan(0);
    // Google never says feedback was left: the page never claims it.
    expect(screen.queryByText(/done/i)).not.toBeInTheDocument();
    // Our streak and Google's clock are labelled apart.
    expect(screen.getByText(/A missed day restarts it at Day 1/)).toBeInTheDocument();
    expect(screen.getByText(/Our missed days never reset it/)).toBeInTheDocument();
  });

  it("switches app through the URL and reads that app", async () => {
    nav.params = new URLSearchParams("app=rider");
    api.listPlayTesters.mockResolvedValue(roster({ app: "rider", testers: [] }));
    render(<PlayTestersDesk tree="admin" />);
    expect(await screen.findByText("No Rider testers yet")).toBeInTheDocument();
    expect(api.listPlayTesters).toHaveBeenCalledWith("rider");
    fireEvent.click(screen.getByRole("button", { name: "Shop" }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/play-testers?app=supplier", {
      scroll: false,
    });
  });

  it("flags a tester who stopped checking in, and a finished run", async () => {
    api.listPlayTesters.mockResolvedValue(
      roster({
        testers: [
          tester({ stoppedCheckingIn: true }),
          tester({ userId: "user_ben", name: "Ben", day: 14, streak: 14 }),
        ],
      }),
    );
    await ready();
    expect(screen.getAllByText("Stopped checking in").length).toBeGreaterThan(0);
    expect(screen.getAllByText("14 straight days").length).toBeGreaterThan(0);
  });

  it.each([
    ["user_not_found", 404, "No GRIDGO account uses this email. Check the spelling."],
    ["already_enrolled", 409, "Already testing the Client app."],
    ["role_mismatch", 400, "This account has no client membership. Add it under its own app."],
  ])("explains %s inline when adding", async (code, status, copy) => {
    api.addPlayTester.mockRejectedValue(new ApiError(status, { error: code }));
    await ready();
    const field = screen.getByLabelText("Add a Client tester");
    fireEvent.change(field, { target: { value: "x@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tester" }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(api.addPlayTester).toHaveBeenCalledWith("client", "x@example.com");
  });

  it("adds a tester and reloads", async () => {
    await ready();
    fireEvent.change(screen.getByLabelText("Add a Client tester"), {
      target: { value: " new@example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add tester" }));
    expect(await screen.findByText("Added new@example.com.")).toBeInTheDocument();
    expect(api.addPlayTester).toHaveBeenCalledWith("client", "new@example.com");
    expect(api.listPlayTesters).toHaveBeenCalledTimes(2);
  });

  it("removes only after a confirm that says history is kept", async () => {
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove tester" })[0]);
    expect(await screen.findByText(/Check-ins and feedback stay on record/)).toBeInTheDocument();
    expect(api.removePlayTester).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.removePlayTester).toHaveBeenCalledWith("client", "user_ana"));
    expect(await screen.findByText("Removed Ana Reyes.")).toBeInTheDocument();
  });

  it("shows a remove failure in the dialog", async () => {
    api.removePlayTester.mockRejectedValue(new ApiError(500, { error: "server_error" }));
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove tester" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Could not remove the tester. Try again.")).toBeInTheDocument();
  });

  it("edits the opted-in count and the clock date inline", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit opted-in count" }));
    const count = screen.getByLabelText("Opted-in testers");
    fireEvent.change(count, { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a whole number, 0 or more.")).toBeInTheDocument();
    expect(api.updatePlayTesterSettings).not.toHaveBeenCalled();
    fireEvent.change(count, { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", { optedInCount: 14 }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Edit clock start date" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit clock start date" }));
    fireEvent.change(screen.getByLabelText("Clock start date"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        playClockStartDate: "2026-11-01",
      }),
    );
  });

  it("asks before marking production approved", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Mark production approved" }));
    fireEvent.change(screen.getByLabelText("Production approval date"), {
      target: { value: "2026-11-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark approved" }));
    expect(
      await screen.findByText("Every Client tester's reminders and check-ins stop."),
    ).toBeInTheDocument();
    expect(api.updatePlayTesterSettings).not.toHaveBeenCalled();
    const confirm = screen
      .getAllByRole("button", { name: "Mark approved" })
      .find((b) => b.closest("[role='alertdialog']"));
    fireEvent.click(confirm!);
    await waitFor(() =>
      expect(api.updatePlayTesterSettings).toHaveBeenCalledWith("client", {
        productionApprovedAt: "2026-11-01T16:00:00.000Z",
      }),
    );
  });

  it("shows a settings failure next to the values", async () => {
    api.updatePlayTesterSettings.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit opted-in count" }));
    fireEvent.change(screen.getByLabelText("Opted-in testers"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Only Operations and Super Admin can open the Play testers page."),
    ).toBeInTheDocument();
  });

  it.each([
    [
      new ApiError(403, { error: "test_operations_forbidden" }),
      "Test operations logins cannot open the Play testers page.",
    ],
    [
      new ApiError(403, { error: "forbidden" }),
      "Only Operations and Super Admin can open the Play testers page.",
    ],
  ])("explains a refused read", async (err, copy) => {
    api.listPlayTesters.mockRejectedValue(err);
    render(<PlayTestersDesk tree="ops" />);
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a Client tester")).not.toBeInTheDocument();
  });

  it("shows a feedback tap on its Manila date", async () => {
    // 01:00 on 9 Nov in Manila is still 8 Nov in UTC.
    api.listPlayTesters.mockResolvedValue(
      roster({
        testers: [
          tester({
            feedback: { shownCount: 1, tappedAt: "2026-11-08T17:00:00.000Z", dismissedCount: 0 },
          }),
        ],
      }),
    );
    await ready();
    expect(
      screen.getAllByLabelText("Feedback card shown 1 time, tapped Nov 9, dismissed 0").length,
    ).toBeGreaterThan(0);
  });

  /** Client on screen, with a Shop roster ready for when the app switches. */
  function twoApps() {
    const shop = roster({
      app: "supplier",
      testers: [tester({ userId: "user_shop", name: "Shop Tester", email: "shop@example.com" })],
    });
    api.listPlayTesters.mockImplementation(async (app: string) =>
      app === "supplier" ? shop : roster(),
    );
    const view = render(<PlayTestersDesk tree="ops" />);
    const toShop = async () => {
      nav.params = new URLSearchParams("app=supplier");
      view.rerender(<PlayTestersDesk tree="ops" />);
      await screen.findAllByText("Shop Tester");
    };
    return { toShop };
  }

  it("keeps the Shop page when a Client save finishes after the switch", async () => {
    let finish!: () => void;
    api.updatePlayTesterSettings.mockReturnValue(new Promise<void>((done) => (finish = done)));
    const { toShop } = twoApps();
    await screen.findAllByText("Ana Reyes");
    fireEvent.click(screen.getByRole("button", { name: "Edit opted-in count" }));
    fireEvent.change(screen.getByLabelText("Opted-in testers"), { target: { value: "17" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await toShop();
    const reads = api.listPlayTesters.mock.calls.length;
    await act(async () => finish());
    expect(api.listPlayTesters.mock.calls.length).toBe(reads);
    expect(screen.getAllByText("Shop Tester").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ana Reyes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit opted-in count" })).toBeInTheDocument();
  });

  it("keeps the Shop page when a Client add finishes after the switch", async () => {
    let finish!: () => void;
    api.addPlayTester.mockReturnValue(new Promise<void>((done) => (finish = done)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { toShop } = twoApps();
    await screen.findAllByText("Ana Reyes");
    fireEvent.change(screen.getByLabelText("Add a Client tester"), {
      target: { value: "late@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add tester" }));
    await toShop();
    const reads = api.listPlayTesters.mock.calls.length;
    await act(async () => finish());
    expect(api.listPlayTesters.mock.calls.length).toBe(reads);
    expect(screen.queryByText("Added late@example.com.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Shop Tester").length).toBeGreaterThan(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("lets a failed add from a form that is gone land nowhere", async () => {
    let fail!: (err: unknown) => void;
    api.addPlayTester.mockReturnValue(new Promise<void>((_, reject) => (fail = reject)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { toShop } = twoApps();
    await screen.findAllByText("Ana Reyes");
    fireEvent.change(screen.getByLabelText("Add a Client tester"), {
      target: { value: "x@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add tester" }));
    await toShop();
    await act(async () => fail(new ApiError(404, { error: "user_not_found" })));
    const field = screen.getByLabelText("Add a Shop tester");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(field).not.toBeDisabled();
    expect(screen.queryByText(/No GRIDGO account uses this email/)).not.toBeInTheDocument();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("drops a read that lands after the page is gone", async () => {
    let resolve!: (value: PlayTesterRoster) => void;
    api.listPlayTesters.mockReturnValue(new Promise((done) => (resolve = done)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<PlayTestersDesk tree="ops" />);
    unmount();
    await act(async () => resolve(roster()));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
