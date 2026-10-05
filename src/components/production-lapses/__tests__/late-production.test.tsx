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

import type { Order, ProductionLapse, ShopRankingRow } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const api = vi.hoisted(() => ({
  getShopRankings: vi.fn(),
  getSettings: vi.fn(),
  listSupplierProductionLapses: vi.fn(),
  listOrders: vi.fn(),
  recordProductionNoCommunication: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  ...api,
}));
const { LateProductionFleet } =
  await import("@/components/production-lapses/LateProductionFleet");
const { ShopLapses } = await import("@/components/production-lapses/ShopLapses");

const HOUR = 3_600_000;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const policy = {
  deductionsEnabled: false,
  minorBps: 500,
  moderateBps: 1500,
  severeBps: 3000,
};

function shop(supplierId: string, shopName: string): ShopRankingRow {
  return {
    supplierId,
    shopName,
    position: null,
    count: 0,
    quality: null,
    speed: null,
    value: null,
    overall: null,
    onTime: null,
    fromPriceMinor: null,
  };
}

function lapse(p: Partial<ProductionLapse> = {}): ProductionLapse {
  return {
    id: "lapse_1",
    orderId: "ord_1",
    supplierId: "sup_a",
    deadlineAt: iso(NOW - 30 * HOUR),
    detectedAt: iso(NOW - 29 * HOUR),
    tier: "minor",
    rateBps: 500,
    settingsVersion: 3,
    policy,
    warnings: [
      {
        tier: "minor",
        at: iso(NOW - 29 * HOUR),
        message: "This order missed its ready-by deadline.",
        formal: false,
      },
    ],
    remainingBalanceMinor: 0,
    deductionMinor: 0,
    appliedAt: null,
    closedAt: null,
    reassignmentEligible: false,
    status: "warning_only",
    ...p,
  };
}

function order(p: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "c",
    supplierId: "sup_a",
    riderId: null,
    state: "production",
    title: "Flyers A5",
    deadline: null,
    address: "",
    payoutMilestones: [
      {
        code: "start",
        sharePercent: 40,
        amountMinor: 40_000,
        status: "released",
        pofFileIds: [],
      },
      {
        code: "delivered",
        sharePercent: 35,
        amountMinor: 35_000,
        status: "pending",
        pofFileIds: [],
      },
      {
        code: "window",
        sharePercent: 25,
        amountMinor: 25_000,
        status: "pending",
        pofFileIds: [],
      },
    ],
    ...p,
  } as Order;
}

beforeEach(() => {
  api.getSettings.mockResolvedValue({ version: 3, productionPenalty: policy });
});

afterEach(() => {
  cleanup();
  for (const fn of Object.values(api)) fn.mockReset();
});

describe("fleet", () => {
  it("lists problem shops first, links into the caller's tree, and counts clean shops", async () => {
    api.getShopRankings.mockResolvedValue({
      categories: [],
      categoryCode: null,
      rankedCount: 0,
      rows: [shop("sup_a", "Shop A"), shop("sup_b", "Shop B"), shop("sup_c", "Shop C")],
    });
    api.listSupplierProductionLapses.mockImplementation(async (id: string) => ({
      supplierId: id,
      lapses:
        id === "sup_a"
          ? [lapse()]
          : id === "sup_b"
            ? [lapse({ id: "b1", tier: "severe" }), lapse({ id: "b2", tier: "moderate" })]
            : [],
    }));
    render(<LateProductionFleet tree="admin" />);

    const table = await screen.findByRole("table", { name: "Shops with late jobs" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("link")[0].textContent)).toEqual([
      "Shop B",
      "Shop A",
    ]);
    expect(within(rows[0]).getAllByRole("link")[0]).toHaveAttribute(
      "href",
      "/admin/late-production/sup_b",
    );
    expect(within(rows[0]).getByText("−4 of 10 quality")).toBeInTheDocument();
    expect(within(rows[0]).getByText("1 severe, 1 moderate")).toBeInTheDocument();
    expect(
      screen.getByText("1 other shop has no late jobs on record."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("deduction-gate")).toHaveTextContent("Warnings only");
  });

  it("names a shop it could not read instead of counting it as on time", async () => {
    api.getShopRankings.mockResolvedValue({
      categories: [],
      categoryCode: null,
      rankedCount: 0,
      rows: [shop("sup_a", "Shop A"), shop("sup_b", "Shop B")],
    });
    api.listSupplierProductionLapses.mockImplementation(async (id: string) => {
      if (id === "sup_b") throw new Error("boom");
      return { supplierId: id, lapses: [] };
    });
    render(<LateProductionFleet tree="ops" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read late jobs for 1 shop: Shop B",
    );
    expect(screen.getByText("No late jobs on record")).toBeInTheDocument();
  });

  it("invites the next step when no shop has been late", async () => {
    api.getShopRankings.mockResolvedValue({
      categories: [],
      categoryCode: null,
      rankedCount: 0,
      rows: [shop("sup_a", "Shop A")],
    });
    api.listSupplierProductionLapses.mockResolvedValue({
      supplierId: "sup_a",
      lapses: [],
    });
    render(<LateProductionFleet tree="ops" />);

    expect(await screen.findByText("No late jobs on record")).toBeInTheDocument();
    expect(
      screen.getByText(/Every shop has marked its jobs ready on time so far/),
    ).toBeInTheDocument();
  });
});

describe("one shop", () => {
  beforeEach(() => {
    api.getShopRankings.mockResolvedValue({
      categories: [],
      categoryCode: null,
      rankedCount: 0,
      rows: [shop("sup_a", "Shop A")],
    });
  });

  it("shows how late, the tier, the warning, the deduction and what is still owed", async () => {
    api.listSupplierProductionLapses.mockResolvedValue({
      supplierId: "sup_a",
      lapses: [
        lapse({
          id: "l2",
          orderId: "ord_2",
          tier: "moderate",
          rateBps: 1500,
          status: "applied",
          remainingBalanceMinor: 60_000,
          deductionMinor: 9_000,
          appliedAt: iso(NOW),
          warnings: [
            {
              tier: "moderate",
              at: iso(NOW - HOUR),
              message: "A formal warning has been added.",
              formal: true,
            },
          ],
        }),
        lapse(),
      ],
    });
    api.listOrders.mockResolvedValue([
      order(),
      order({
        id: "ord_2",
        title: "Tarpaulin 3x6",
        state: "ready_for_dispatch",
        readyAt: iso(NOW - 30 * HOUR + 8 * HOUR),
        payoutMilestones: [
          {
            code: "start",
            sharePercent: 40,
            amountMinor: 40_000,
            status: "released",
            pofFileIds: [],
          },
          {
            code: "delivered",
            sharePercent: 35,
            amountMinor: 35_000,
            status: "pending",
            pofFileIds: [],
          },
          {
            code: "window",
            sharePercent: 25,
            amountMinor: 16_000,
            productionDeductionMinor: 9_000,
            status: "pending",
            pofFileIds: [],
          },
        ],
      }),
    ]);
    render(<ShopLapses tree="ops" supplierId="sup_a" />);

    const table = await screen.findByRole("table", { name: "Shop A: late jobs" });
    expect(screen.getByRole("heading", { name: "Shop A" })).toBeInTheDocument();
    const [applied, open] = within(table).getAllByRole("row").slice(1);

    expect(within(applied).getByRole("link", { name: "Tarpaulin 3x6" })).toHaveAttribute(
      "href",
      "/ops/orders/ord_2",
    );
    expect(within(applied).getByText("Ready 8 h late")).toBeInTheDocument();
    expect(within(applied).getByText("Moderate")).toBeInTheDocument();
    expect(within(applied).getByText("Formal warning")).toBeInTheDocument();
    expect(within(applied).getByText("−₱90.00")).toBeInTheDocument();
    expect(within(applied).getByText("15% of ₱600.00")).toBeInTheDocument();
    expect(within(applied).getByText("₱510.00")).toBeInTheDocument();
    expect(within(applied).getByText("Deducted")).toBeInTheDocument();

    expect(within(open).getByText(/Not ready, 1 d 6 h past/)).toBeInTheDocument();
    expect(within(open).getByText("₱600.00")).toBeInTheDocument();
    expect(
      within(open).getByText("Deductions were off when it began"),
    ).toBeInTheDocument();
    expect(within(open).getByText("Warning only")).toBeInTheDocument();
    expect(screen.getByTestId("shop-lapse-summary")).toHaveTextContent(
      "2 late in the last 30 days",
    );
  });

  it("records no word from the shop on an open overdue job, with a reason", async () => {
    api.listSupplierProductionLapses.mockResolvedValue({
      supplierId: "sup_a",
      lapses: [lapse()],
    });
    api.listOrders.mockResolvedValue([order()]);
    api.recordProductionNoCommunication.mockResolvedValue([lapse({ tier: "severe" })]);
    render(<ShopLapses tree="admin" supplierId="sup_a" />);

    const table = await screen.findByRole("table", { name: "Shop A: late jobs" });
    fireEvent.click(within(table).getByRole("button", { name: "No word from the shop" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Record no word" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("How you tried to reach the shop"), {
      target: { value: "Called twice, no answer." },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(api.recordProductionNoCommunication).toHaveBeenCalledWith(
        "ord_1",
        "Called twice, no answer.",
      ),
    );
    expect(await screen.findByText(/is now a severe lapse/)).toBeInTheDocument();
  });

  it("says when the shop has never been late", async () => {
    api.listSupplierProductionLapses.mockResolvedValue({
      supplierId: "sup_a",
      lapses: [],
    });
    api.listOrders.mockResolvedValue([]);
    render(<ShopLapses tree="ops" supplierId="sup_a" />);

    expect(await screen.findByText("No late jobs")).toBeInTheDocument();
  });
});
