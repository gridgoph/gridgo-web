// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopHours, WeeklyWindow } from "@/lib/api/types";
import type { ShopHoursRow } from "@/lib/shop-hours";

vi.stubGlobal("React", React);
// Base UI's switch dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  pointerType = "mouse";
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const api = vi.hoisted(() => ({
  listShopHours: vi.fn(),
  getShopHours: vi.fn(),
  setShopTemporarilyClosed: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...api,
}));
const { ApiError } = await import("@/lib/api/client");
const { ShopHoursDesk } = await import("@/components/shop-hours/ShopHoursDesk");
const { ShopHoursDetail } = await import("@/components/shop-hours/ShopHoursDetail");

const MON_SAT: WeeklyWindow[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensMinute: 480,
  closesMinute: 1080,
}));

function hours(patch: Partial<ShopHours> = {}): ShopHours {
  return {
    version: 4,
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

const ROWS: ShopHoursRow[] = [
  { supplierId: "sup_a", shopName: "Shop A", hours: hours() },
  {
    supplierId: "sup_b",
    shopName: "Shop B",
    hours: hours({ temporarilyClosed: true, isOpenNow: false, nextOpeningAt: null }),
  },
  {
    supplierId: "sup_c",
    shopName: "Shop C",
    hours: hours({
      todayExtension: { day: "2026-10-16", opensMinute: 1080, closesMinute: 1200 },
      dispatchWaits: true,
      closures: [{ startDay: "2026-12-24", endDay: "2026-12-26" }],
    }),
  },
];

beforeEach(() => {
  // Friday 16 Oct 2026, 10:00 AM in Manila.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T10:00:00+08:00"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Shop hours desk", () => {
  it("lists every shop, closed-for-now first, with the week and what is ahead", async () => {
    api.listShopHours.mockResolvedValue(ROWS);
    render(<ShopHoursDesk tree="ops" />);
    expect(await screen.findByTestId("shop-hours-summary")).toHaveTextContent(
      "3 shops: 2 open now, 0 closed, 1 temporarily closed.",
    );
    const table = screen.getByRole("table", { name: "Shop hours" });
    const links = within(table).getAllByRole("link", { name: /^Shop [ABC]$/ });
    expect(links.map((link) => link.textContent)).toEqual(["Shop B", "Shop A", "Shop C"]);
    expect(links[0]).toHaveAttribute("href", "/ops/shop-hours/sup_b");
    expect(within(table).getByText("Closed for now")).toBeInTheDocument();
    expect(within(table).getAllByText("Mon–Sat, 8:00 AM to 6:00 PM").length).toBe(3);
    expect(within(table).getByText("Extended from 6:00 PM, past GRIDGO's hours")).toBeInTheDocument();
    expect(within(table).getByText(/^Thu, .*24.* to Sat, .*26/)).toBeInTheDocument();
  });

  it("says when the API has no shop hours yet", async () => {
    api.listShopHours.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<ShopHoursDesk tree="admin" />);
    expect(await screen.findByText("Shop hours are not open yet")).toBeInTheDocument();
  });
});

describe("one shop's hours", () => {
  it("shows the week, the closures and today's extension with the after-hours notice", async () => {
    api.getShopHours.mockResolvedValue(ROWS[2].hours);
    api.listShopHours.mockResolvedValue(ROWS);
    render(<ShopHoursDetail tree="admin" supplierId="sup_c" />);
    expect(await screen.findByRole("heading", { name: "Shop C" })).toBeInTheDocument();
    expect(screen.getByText("Open until 8:00 PM today")).toBeInTheDocument();
    expect(screen.getByTestId("dispatch-notice")).toHaveTextContent(
      "Review and dispatch resume in the next working window.",
    );
    const week = screen.getByRole("list", { name: "Weekly hours" });
    expect(within(week).getAllByText("8:00 AM to 6:00 PM")).toHaveLength(6);
    expect(within(week).getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("3 of 90 closure dates used.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All shops" })).toHaveAttribute("href", "/admin/shop-hours");
    // Staff can close the shop, never edit its hours.
    expect(screen.queryByRole("button", { name: /Save weekly hours/ })).not.toBeInTheDocument();
  });

  it("closes the shop for now only with a reason", async () => {
    api.getShopHours.mockResolvedValue(ROWS[0].hours);
    api.listShopHours.mockResolvedValue(ROWS);
    api.setShopTemporarilyClosed.mockResolvedValue(
      hours({ version: 5, temporarilyClosed: true, isOpenNow: false, nextOpeningAt: null }),
    );
    render(<ShopHoursDetail tree="ops" supplierId="sup_a" />);
    fireEvent.click(await screen.findByRole("switch", { name: "Temporarily closed" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Close Shop A for now?")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Close for now" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Why it is closing"), {
      target: { value: "  The press is down until Monday.  " },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api.setShopTemporarilyClosed).toHaveBeenCalledWith("sup_a", {
        expectedVersion: 4,
        temporarilyClosed: true,
        reason: "The press is down until Monday.",
      }),
    );
    expect(
      await screen.findByText("Shop A is closed for now. The shop has been told."),
    ).toBeInTheDocument();
  });

  it("reloads and says so when the shop changed its hours meanwhile", async () => {
    api.getShopHours
      .mockResolvedValueOnce(ROWS[0].hours)
      .mockResolvedValueOnce(hours({ version: 6 }));
    api.listShopHours.mockResolvedValue(ROWS);
    api.setShopTemporarilyClosed.mockRejectedValue(
      new ApiError(409, { error: "supplier_profile_stale" }),
    );
    render(<ShopHoursDetail tree="ops" supplierId="sup_a" />);
    fireEvent.click(await screen.findByRole("switch", { name: "Temporarily closed" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Why it is closing"), {
      target: { value: "Closing for a stock count." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close for now" }));
    expect(
      await within(dialog).findByText(/This shop's details changed while this page was open/),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.getShopHours).toHaveBeenCalledTimes(2));
  });

  it("says when there is no shop at that link", async () => {
    api.getShopHours.mockRejectedValue(new ApiError(404, { error: "supplier_profile_not_found" }));
    api.listShopHours.mockResolvedValue([]);
    render(<ShopHoursDetail tree="ops" supplierId="nobody" />);
    expect(await screen.findByText("No shop with this link")).toBeInTheDocument();
  });
});
