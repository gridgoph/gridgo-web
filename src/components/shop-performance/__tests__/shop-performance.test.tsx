// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ShopPerformanceDetail } from "@/components/shop-performance/ShopPerformanceDetail";
import { ShopPerformanceList } from "@/components/shop-performance/ShopPerformanceList";
import { setTokenProvider } from "@/lib/api/client";
import type { PerformanceEvent, SupplierPerformance } from "@/lib/api/types";

vi.stubGlobal("React", React);
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const late: PerformanceEvent = {
  id: "performance_2",
  orderId: "ord_late",
  kind: "late_finish",
  at: "2026-10-16T08:00:00.000Z",
  recordedAt: "2026-10-16T08:00:30.000Z",
  reason: "Finished after the committed ready-by and one-hour grace window.",
  reasonCode: null,
  message:
    "Order ord_late: finished 7.5 shop hours after the committed ready-by (moderate). Reason: Finished after the committed ready-by and one-hour grace window. Warning only; no money is deducted.",
  tier: "moderate",
  deadlineAt: "2026-10-16T00:00:00.000Z",
  hoursLate: 7.5,
  workingLateMs: 27_000_000,
  graceMinutes: 60,
  exempt: false,
  exemptionReason: null,
  warningCodes: ["late_finish"],
  active: true,
};

const onTime: PerformanceEvent = {
  ...late,
  id: "performance_1",
  orderId: "ord_ok",
  kind: "on_time_finish",
  message: null,
  tier: null,
  hoursLate: 0,
  workingLateMs: 0,
  warningCodes: [],
  active: false,
};

function shop(p: Partial<SupplierPerformance> = {}): SupplierPerformance {
  return {
    supplierId: "sup_a",
    asOf: "2026-10-18T00:00:00.000Z",
    policy: "warnings_only",
    windowDays: 30,
    graceMinutes: 60,
    counts: { declines: 0, timeouts: 0, lateFinishes: 1, cancellations: 0, arrivedPacked: 0 },
    rosterReview: false,
    topPick: { hidden: false, hiddenUntil: null, allHiddenFallback: true },
    onTime: { completed: 2, onTime: 1, late: 1, rate: 0.5 },
    warnings: [late],
    notices: [late],
    events: [late, onTime],
    ...p,
  };
}

let shops: SupplierPerformance[];
let requests: { method: string; path: string; body: unknown }[];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  replace.mockReset();
  search = "";
  requests = [];
  shops = [
    shop({ supplierId: "sup_quiet", counts: { declines: 0, timeouts: 0, lateFinishes: 0, cancellations: 0, arrivedPacked: 0 }, warnings: [], notices: [], events: [], onTime: { completed: 0, onTime: 0, late: 0, rate: null } }),
    shop({ topPick: { hidden: true, hiddenUntil: "2026-10-23T08:00:00.000Z", allHiddenFallback: true } }),
  ];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://gridgo.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, path: url.pathname, body });
      if (url.pathname === "/ops/shops/performance") return json({ shops });
      if (url.pathname === "/admin/shop-rankings") {
        return json({
          categories: [],
          categoryCode: null,
          rankedCount: 0,
          rows: [
            { supplierId: "sup_a", shopName: "Shop Alpha" },
            { supplierId: "sup_quiet", shopName: "Shop Quiet" },
          ],
        });
      }
      if (url.pathname === "/orders/ord_late/performance-no-fault") {
        return json({
          performance: shop({
            counts: { declines: 0, timeouts: 0, lateFinishes: 0, cancellations: 0, arrivedPacked: 0 },
            warnings: [],
            notices: [{ ...late, exempt: true, exemptionReason: body.reason, active: false }],
          }),
        });
      }
      if (url.pathname.startsWith("/ops/shops/")) return json({ performance: shops[1] });
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

it("lists shops needing a look first, by name, with no money anywhere", async () => {
  const { container } = render(<ShopPerformanceList tree="ops" />);
  const table = await screen.findByRole("table");
  const names = within(table)
    .getAllByRole("link")
    .map((link) => link.textContent);
  expect(names[0]).toBe("Shop Alpha");
  expect(within(table).getByText(/Hidden from Top Pick until/)).toBeVisible();
  expect(within(table).getByText("50%")).toBeVisible();
  expect(container.textContent).not.toMatch(/₱|deduct(ed|ion) of/i);
});

it("opens the shop holding an inbox notice's order", async () => {
  search = "order=ord_late";
  render(<ShopPerformanceList tree="admin" />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/shop-performance/sup_a"));
});

it("shows Operations the notices with no no-fault control", async () => {
  render(<ShopPerformanceDetail tree="ops" supplierId="sup_a" />);
  expect(await screen.findByRole("heading", { name: "Shop Alpha" })).toBeVisible();
  expect(screen.getByText(late.message!)).toBeVisible();
  expect(screen.getAllByText(/7 hours 30 min late in shop hours/)[0]).toBeVisible();
  expect(screen.queryByRole("button", { name: "Mark no-fault" })).toBeNull();
  expect(screen.getByText("Only Super Admin can mark a late finish no-fault.")).toBeVisible();
});

it("lets Super Admin mark a late finish no-fault with a reason", async () => {
  const user = userEvent.setup();
  render(<ShopPerformanceDetail tree="admin" supplierId="sup_a" />);
  await user.click(await screen.findByRole("button", { name: "Mark no-fault" }));
  const dialog = await screen.findByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", { name: "Mark no-fault" });
  expect(confirm).toBeDisabled();
  await user.type(
    within(dialog).getByLabelText(/Why it was not the shop/),
    "Verified outage in the area.",
  );
  await user.click(confirm);
  await waitFor(() =>
    expect(requests.find((r) => r.path === "/orders/ord_late/performance-no-fault")?.body).toEqual({
      reason: "Verified outage in the area.",
      supplierId: "sup_a",
    }),
  );
  expect(await screen.findByText("Exempt: Verified outage in the area.")).toBeVisible();
});
