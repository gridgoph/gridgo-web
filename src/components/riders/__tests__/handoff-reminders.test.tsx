// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

const { api, nav } = vi.hoisted(() => ({
  api: { apiRequest: vi.fn(), listUsers: vi.fn() },
  nav: { replace: vi.fn(), params: new URLSearchParams() },
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => nav.params,
  usePathname: () => "/ops/handoff-reminders",
}));
vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { HandoffReminders, stripWeeks } from "@/components/riders/HandoffReminders";

// Wednesday 28 Oct 2026, 10:00 in Manila: the week of 26 Oct.
const NOW = new Date("2026-10-28T02:00:00Z");

const row = (extra: Record<string, unknown> = {}) => ({
  riderId: "rider_1",
  week: "2026-W44",
  weekStart: "2026-10-26",
  deliveries: 4,
  remindedDeliveries: 3,
  legacyDeliveries: 1,
  reminderRate: 0.75,
  surveySubmittedDeliveries: 2,
  shareTappedDeliveries: 1,
  surveyAndShareDeliveries: 1,
  ...extra,
});

function report(weeks: unknown[]) {
  api.apiRequest.mockImplementation(async (path: string) => {
    if (path.startsWith("/ops/delivery-reminders")) {
      return { serverTime: NOW.toISOString(), timezone: "Asia/Manila", total: weeks.length, weeks };
    }
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.listUsers.mockResolvedValue([
    { id: "rider_1", name: "Ana Reyes", role: "rider" },
    { id: "rider_2", name: "Ben Cruz", role: "rider" },
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
});

describe("stripWeeks", () => {
  it("holds six fixed weeks ending this week, so picking one never slides the strip", () => {
    expect(stripWeeks("2026-10-26", "2026-10-26")).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(stripWeeks("2026-09-21", "2026-10-26")).toEqual(
      stripWeeks("2026-10-26", "2026-10-26"),
    );
    // The seventh week back opens the block before.
    expect(stripWeeks("2026-09-14", "2026-10-26").at(-1)).toBe("2026-09-14");
  });
});

describe("HandoffReminders", () => {
  it("asks for the six Manila weeks on the strip and shows each rider's rate", async () => {
    report([
      row(),
      row({ riderId: "rider_2", deliveries: 2, remindedDeliveries: 2, legacyDeliveries: 0, surveySubmittedDeliveries: 0, shareTappedDeliveries: 0, surveyAndShareDeliveries: 0 }),
      row({ weekStart: "2026-10-19", week: "2026-W43", deliveries: 5, remindedDeliveries: 1 }),
    ]);
    render(<HandoffReminders tree="ops" />);

    const table = await screen.findByRole("table");
    expect(api.apiRequest).toHaveBeenCalledWith(
      "/ops/delivery-reminders?from=2026-09-20T16%3A00%3A00.000Z&to=2026-11-01T16%3A00%3A00.000Z&offset=0&limit=500",
    );
    const ana = within(table).getByText("Ana Reyes").closest("tr")!;
    expect(within(ana).getByLabelText("3 of 4 deliveries, 75%")).toBeInTheDocument();
    expect(within(ana).getByLabelText("2 of 3 reminded clients, 67%")).toBeInTheDocument();
    expect(within(ana).getByLabelText("1 of 3 reminded clients, 33%")).toBeInTheDocument();
    expect(within(ana).getByText("1 from an older rider app")).toBeInTheDocument();
    // Only this week's riders are listed; last week sits on the strip.
    expect(within(table).getAllByRole("row")).toHaveLength(3);

    // The week's follow-through, across both riders: 5 of 6 reminded.
    expect(screen.getByText("83% of deliveries")).toBeInTheDocument();
    expect(screen.getByText("40% of reminded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Oct 19 – Oct 25, 2026: 20% reminded, 1 of 5 deliveries" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Oct 26 – Nov 1, 2026: 83% reminded/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a reminded rider with no follow-through as zero, not as missing", async () => {
    report([row({ surveySubmittedDeliveries: 0, shareTappedDeliveries: 0, surveyAndShareDeliveries: 0 })]);
    render(<HandoffReminders tree="ops" />);

    const table = await screen.findByRole("table");
    expect(within(table).getAllByLabelText("0 of 3 reminded clients, 0%")).toHaveLength(2);
  });

  it("selects a week from the strip through the address bar", async () => {
    report([row(), row({ weekStart: "2026-10-19", week: "2026-W43" })]);
    render(<HandoffReminders tree="admin" />);

    fireEvent.click(await screen.findByRole("button", { name: /^Oct 19 – Oct 25, 2026/ }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/handoff-reminders?week=2026-10-19", {
      scroll: false,
    });
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });

  it("reads a week and a rider from the address bar", async () => {
    nav.params = new URLSearchParams("week=2026-10-19&rider=rider_2");
    report([
      row({ weekStart: "2026-10-19", week: "2026-W43" }),
      row({ weekStart: "2026-10-19", week: "2026-W43", riderId: "rider_2", deliveries: 1, remindedDeliveries: 0, legacyDeliveries: 1, surveySubmittedDeliveries: 0, shareTappedDeliveries: 0, surveyAndShareDeliveries: 0 }),
    ]);
    render(<HandoffReminders tree="ops" />);

    const table = await screen.findByRole("table");
    expect(within(table).queryByText("Ana Reyes")).toBeNull();
    expect(within(table).getByText("Ben Cruz")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Week of Oct 19" })).toBeInTheDocument();
    expect(
      screen.getByText(/1 delivery was from an older rider app with no reminder step/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(nav.replace).toHaveBeenCalledWith("/ops/handoff-reminders?rider=rider_2", {
      scroll: false,
    });
  });

  it("says plainly when a week has no door deliveries", async () => {
    report([row({ weekStart: "2026-10-19", week: "2026-W43" })]);
    render(<HandoffReminders tree="ops" />);

    expect(await screen.findByText("No door deliveries this week")).toBeInTheDocument();
    expect(screen.getByText(/Hub drop-offs do not involve the client/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: /Oct 26 – Nov 1, 2026: no door deliveries/ })).toBeInTheDocument();
  });

  it("offers a way back to this week from an empty past week", async () => {
    nav.params = new URLSearchParams("week=2026-10-05");
    report([]);
    render(<HandoffReminders tree="ops" />);

    fireEvent.click(await screen.findByRole("button", { name: "Go to this week" }));
    expect(nav.replace).toHaveBeenCalledWith("/ops/handoff-reminders", { scroll: false });
  });

  it("explains a failed read and retries it", async () => {
    api.apiRequest.mockRejectedValueOnce(new ApiError(500, { error: "server_error" }));
    report([row()]);
    render(<HandoffReminders tree="ops" />);

    expect(await screen.findByText("Could not load this screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("names the roles that may read it when the API refuses", async () => {
    api.apiRequest.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    render(<HandoffReminders tree="ops" />);

    expect(
      await screen.findByText("Only Operations and Super Admin can read rider handoff reminders."),
    ).toBeInTheDocument();
  });

  it("is honest about an API that does not report reminders yet", async () => {
    api.apiRequest.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<HandoffReminders tree="ops" />);

    expect(await screen.findByText("Not on this API yet")).toBeInTheDocument();
  });

  it("still reads by rider id when names cannot load", async () => {
    api.listUsers.mockRejectedValue(new Error("offline"));
    report([row({ riderId: "rider_abc123" })]);
    render(<HandoffReminders tree="ops" />);

    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText("Rider abc123")).toBeInTheDocument(),
    );
  });
});
