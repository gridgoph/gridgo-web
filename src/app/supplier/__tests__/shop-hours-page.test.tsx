// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopHours, WeeklyWindow } from "@/lib/api/types";

vi.stubGlobal("React", React);
// Base UI's switch dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  pointerType = "mouse";
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const api = vi.hoisted(() => ({
  getMyShopHours: vi.fn(),
  updateMyShopHours: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...api,
}));
const { ApiError } = await import("@/lib/api/client");
const { default: SupplierShopHoursPage } = await import("@/app/supplier/shop-hours/page");

const MON_SAT: WeeklyWindow[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensMinute: 480,
  closesMinute: 1080,
}));

function hours(patch: Partial<ShopHours> = {}): ShopHours {
  return {
    version: 1,
    week: MON_SAT,
    closures: [],
    temporarilyClosed: false,
    isOpenNow: true,
    calendarAvailable: true,
    nextOpeningAt: "2026-10-16T02:00:00.000Z",
    todayExtension: null,
    dispatchWaits: false,
    ...patch,
  };
}

const EXTENDED = { day: "2026-10-16", opensMinute: 1080, closesMinute: 1200 };

beforeEach(() => {
  // Friday 16 Oct 2026, 10:00 AM in Manila. Only the clock is faked; timers run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T10:00:00+08:00"));
  api.getSettings.mockResolvedValue({
    operatingHours: {
      timeZone: "Asia/Manila",
      schedule: {
        utcOffsetMinutes: 480,
        week: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1020 })),
        closures: [],
      },
      artworkReviewMinutes: 60,
      priorityDispatchCutoffMinute: 960,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("supplier Shop hours", () => {
  it("says the shop is open, until when, in Philippine time", async () => {
    api.getMyShopHours.mockResolvedValue(hours());
    render(<SupplierShopHoursPage />);
    expect(await screen.findByRole("heading", { name: "Open now" })).toBeInTheDocument();
    expect(screen.getByText("Until 6:00 PM today.")).toBeInTheDocument();
    expect(screen.getByText("Times are Philippine time.")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Today: open 8:00 AM to 6:00 PM. It is 10:00 AM now." }),
    ).toBeInTheDocument();
  });

  it("closes the shop for now only after saying what changes", async () => {
    api.getMyShopHours.mockResolvedValue(hours());
    api.updateMyShopHours.mockResolvedValue(hours({ version: 2, temporarilyClosed: true, isOpenNow: false }));
    render(<SupplierShopHoursPage />);
    fireEvent.click(await screen.findByRole("switch", { name: "Temporarily closed" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Close your shop for now?")).toBeInTheDocument();
    expect(within(dialog).getByText(/GRIDGO sends you no new jobs until you reopen/)).toBeInTheDocument();
    expect(api.updateMyShopHours).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close for now" }));
    await waitFor(() =>
      expect(api.updateMyShopHours).toHaveBeenCalledWith(1, { temporarilyClosed: true }),
    );
    expect(
      await screen.findByText("No reopening date is set. You reopen when you switch this off."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reopen your shop first. A temporarily closed shop cannot extend its hours."),
    ).toBeInTheDocument();
  });

  it("extends today to the first time GRIDGO accepts, and warns it runs past GRIDGO's hours", async () => {
    api.getMyShopHours.mockResolvedValue(hours());
    api.updateMyShopHours.mockResolvedValue(
      hours({ version: 2, todayExtension: { day: "2026-10-16", opensMinute: 1080, closesMinute: 1110 }, dispatchWaits: true }),
    );
    render(<SupplierShopHoursPage />);
    const button = await screen.findByRole("button", { name: "Extend today's hours until 6:30 PM" });
    // GRIDGO closes at 5:00 PM here, so the warning shows before saving.
    expect(screen.getByTestId("dispatch-notice")).toHaveTextContent(
      "Review and dispatch resume in the next working window.",
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.updateMyShopHours).toHaveBeenCalledWith(1, { extension: { closesMinute: 1110 } }),
    );
    expect(await screen.findByText("Open until 6:30 PM today")).toBeInTheDocument();
  });

  it("sends today's extension again with a new week", async () => {
    api.getMyShopHours.mockResolvedValue(hours({ todayExtension: EXTENDED }));
    api.updateMyShopHours.mockResolvedValue(hours({ version: 2, todayExtension: EXTENDED }));
    render(<SupplierShopHoursPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sunday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save weekly hours" }));
    await waitFor(() => expect(api.updateMyShopHours).toHaveBeenCalled());
    expect(api.updateMyShopHours).toHaveBeenCalledWith(1, {
      schedule: {
        utcOffsetMinutes: 480,
        week: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1080 })),
        closures: [],
      },
      extension: { closesMinute: 1200 },
    });
  });

  it("asks before a save that has to end today's extension", async () => {
    api.getMyShopHours.mockResolvedValue(hours({ todayExtension: EXTENDED }));
    render(<SupplierShopHoursPage />);
    // Friday off: today stops being an open day, so the extension cannot stay.
    fireEvent.click(await screen.findByRole("button", { name: "Friday, today" }));
    fireEvent.click(screen.getByRole("button", { name: "Save weekly hours" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Save and end today's extension to 8:00 PM?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep the extension" }));
    expect(await screen.findByText("Nothing was saved. Today's extension is unchanged.")).toBeInTheDocument();
    expect(api.updateMyShopHours).not.toHaveBeenCalled();
  });

  it("refuses an overlapping closure before sending it", async () => {
    api.getMyShopHours.mockResolvedValue(
      hours({ closures: [{ startDay: "2026-12-24", endDay: "2026-12-26" }] }),
    );
    render(<SupplierShopHoursPage />);
    expect(await screen.findByText("3 of 90 closure dates used.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add closure dates" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("First closed date"), { target: { value: "2026-12-26" } });
    fireEvent.change(within(dialog).getByLabelText("Last closed date"), { target: { value: "2026-12-27" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add closure dates" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/overlaps your closure/);
    expect(api.updateMyShopHours).not.toHaveBeenCalled();
  });

  it("reloads and says so when the hours changed somewhere else", async () => {
    api.getMyShopHours.mockResolvedValueOnce(hours()).mockResolvedValueOnce(hours({ version: 3 }));
    api.updateMyShopHours.mockRejectedValue(new ApiError(409, { error: "supplier_profile_stale" }));
    render(<SupplierShopHoursPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Extend today's hours until 6:30 PM" }));
    expect(
      await screen.findByText(/Your shop's details changed somewhere else while this page was open/),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.getMyShopHours).toHaveBeenCalledTimes(2));
  });
});
