// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopSummary } from "@/lib/api/types";
import { ShopAccessProvider } from "@/lib/auth/shop-access";
import { readShopMoney, readShopMoneySchedule } from "@/lib/supplier-money";

const api = vi.hoisted(() => ({
  listJobs: vi.fn(),
  listIssues: vi.fn(),
  getMyShopMoney: vi.fn(),
  getShopMoneySchedule: vi.fn(),
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Verification has its own tests; here the shop is verified and quiet.
vi.mock("@/components/shop-verification/useShopVerification", () => ({
  useShopVerification: () => ({ state: { kind: "loading" }, reload: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import SupplierPayoutsPage from "@/app/supplier/payouts/page";

/** Monday 23 Nov 2026, 10:00 Manila: a business day, before the 4 PM run. */
const MONDAY_10AM = new Date("2026-11-23T02:00:00.000Z");
/** The same day, 7:00 PM Manila: past the 6 PM deadline. */
const MONDAY_7PM = new Date("2026-11-23T11:00:00.000Z");

const SCHEDULE = readShopMoneySchedule({
  payoutTime: "16:00",
  minimumMinor: 10000,
  payDeadline: "18:00",
  reminderTime: "17:00",
  bonusRateBps: 2000,
  bonusDays: 7,
  bonusCapMinor: 50000,
});

const BALANCES = {
  owedMinor: 14400,
  owingMinor: 2300,
  netMinor: 12100,
  paidMinor: 6000,
  overdue: false,
  paused: false,
  nextPayoutAt: "2026-11-23T08:00:00.000Z",
};

function bonus(amountMinor: number) {
  return {
    amountMinor,
    firstOrderAt: "2026-11-20T02:00:00.000Z",
    days: 7,
    rateBps: 2000,
    capMinor: 50000,
  };
}

function money(overrides: Record<string, unknown> = {}) {
  return readShopMoney({
    balances: BALANCES,
    policy: { counterCashEnabled: false, version: 0 },
    history: [
      { id: "l1", kind: "entitlement", orderId: "ord_7c20aa11bb22", at: "2026-11-21T05:52:00.000Z", owedDeltaMinor: 7200, owingDeltaMinor: 0, data: {} },
      { id: "l2", kind: "payout", orderId: null, at: "2026-11-21T08:02:00.000Z", owedDeltaMinor: -6000, owingDeltaMinor: 0, data: { reference: "TX-7741" } },
      { id: "l3", kind: "recovery_due", orderId: null, at: "2026-11-21T09:00:00.000Z", owedDeltaMinor: 0, owingDeltaMinor: 2300 },
    ],
    jobs: [
      { orderId: "ord_7c20aa11bb22", createdAt: "2026-11-21T05:00:00.000Z", clientPayment: { methods: ["in_app_qr", "voucher"], settlement: "daily" }, shopPayMinor: 7200, bonus: null },
    ],
    earningsByDay: { "2026-11-21": 7200, "2026-11-20": 4000 },
    paymentMethods: { in_app_qr: 1, voucher: 1 },
    payGridgo: null,
    ...overrides,
  });
}

const OWING = {
  balances: { ...BALANCES, owedMinor: 0, owingMinor: 3800, netMinor: -3800 },
  payGridgo: {
    requestId: "pg_1",
    amountMinor: 3800,
    reference: "GG-PAY-7Q2K",
    deadlineAt: "2026-11-23T10:00:00.000Z",
    qrImageUrl: "/public/payment-qr?v=file_1",
    confirmation: "manual",
  },
};

function renderPage(shop: Partial<ShopSummary> | null = null) {
  return render(
    <ShopAccessProvider shop={shop as ShopSummary | null}>
      <SupplierPayoutsPage />
    </ShopAccessProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MONDAY_10AM);
  api.listJobs.mockResolvedValue([]);
  api.listIssues.mockResolvedValue([]);
  api.getShopMoneySchedule.mockResolvedValue(SCHEDULE);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Money for the shop Owner", () => {
  it("shows both balances, the net and the next payout rule for a positive net", async () => {
    api.getMyShopMoney.mockResolvedValue(money());
    renderPage();

    const card = await screen.findByTestId("shop-balances");
    expect(within(card).getByTestId("balance-owed")).toHaveTextContent("GRIDGO owes you");
    expect(within(card).getByTestId("balance-owed")).toHaveTextContent("₱144.00");
    expect(within(card).getByTestId("balance-owing")).toHaveTextContent("You owe GRIDGO");
    expect(within(card).getByTestId("balance-owing")).toHaveTextContent("₱23.00");
    expect(within(card).getByTestId("balance-net")).toHaveTextContent("GRIDGO pays you");
    expect(within(card).getByTestId("balance-net")).toHaveTextContent("₱121.00");
    expect(within(card).getByTestId("next-payout")).toHaveTextContent(
      "Next payout today, 4:00 PM, to your payout QR: what is ready to release, if it is ₱100.00 or more. GRIDGO pays the transfer fee.",
    );
    // Nothing owed: no Pay GRIDGO and no yellow on the card.
    expect(screen.queryByTestId("pay-gridgo-open")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    // How you earn is built from GRIDGO's schedule.
    expect(screen.getByTestId("how-you-earn")).toHaveTextContent(
      "GRIDGO pays you at 4:00 PM on business days, to your payout QR. ₱100.00 minimum",
    );
    expect(screen.getByTestId("how-you-earn")).toHaveTextContent(
      "Launch week: +20% on your shop pay for 7 days from your first order, up to ₱500.00.",
    );

    // Week activity: methods, days, jobs and history.
    expect(screen.getByTestId("client-payment-methods")).toHaveTextContent("Paid in app");
    expect(screen.getByTestId("client-payment-methods")).toHaveTextContent(
      "A job paid partly by voucher counts under both.",
    );
    expect(screen.getByTestId("earned-per-day")).toHaveTextContent("₱72.00");
    const jobRow = screen.getByTestId("money-job-ord_7c20aa11bb22");
    expect(jobRow).toHaveAttribute("href", "/supplier/jobs/ord_7c20aa11bb22");
    expect(jobRow).toHaveTextContent("Paid in app + voucher");
    expect(jobRow).toHaveTextContent("Paid daily");
    expect(screen.getByTestId("money-history")).toHaveTextContent("Sent to your payout QR");
    expect(screen.getByTestId("money-history")).toHaveTextContent("ref TX-7741");

    // The staged statement stays below, under its own heading.
    expect(await screen.findByTestId("staged-heading")).toHaveTextContent("Jobs paid in parts");
    expect(api.getMyShopMoney).toHaveBeenCalledWith("week");
  });

  it("reads the month when the Owner switches the period", async () => {
    api.getMyShopMoney.mockResolvedValue(money());
    renderPage();
    await screen.findByTestId("shop-balances");
    await userEvent.click(screen.getByRole("button", { name: "Month" }));
    await waitFor(() => expect(api.getMyShopMoney).toHaveBeenCalledWith("month"));
  });

  it("filters the history", async () => {
    api.getMyShopMoney.mockResolvedValue(money());
    renderPage();
    const history = await screen.findByTestId("money-history");
    await userEvent.click(screen.getByRole("button", { name: "You owe" }));
    expect(history).toHaveTextContent("Owed to GRIDGO");
    expect(history).not.toHaveTextContent("Sent to your payout QR");
  });

  it("says a net under the minimum rolls over", async () => {
    api.getMyShopMoney.mockResolvedValue(
      money({ balances: { ...BALANCES, owedMinor: 6000, owingMinor: 0, netMinor: 6000 } }),
    );
    renderPage();
    expect(await screen.findByTestId("next-payout")).toHaveTextContent(
      "You are under the ₱100.00 minimum, so this waits and is added to the next one.",
    );
  });

  it("asks a shop with a negative net to pay GRIDGO before 6 PM", async () => {
    api.getMyShopMoney.mockResolvedValue(money(OWING));
    renderPage();

    const due = await screen.findByTestId("pay-gridgo-due");
    expect(due).toHaveTextContent("Pay GRIDGO ₱38.00");
    expect(due).toHaveTextContent(
      "Due today, 6:00 PM. If it is not paid by then, new orders pause until it is.",
    );
    expect(screen.getByTestId("balance-net")).toHaveTextContent("You pay GRIDGO");
    expect(screen.queryByTestId("next-payout")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Pay ₱38.00" }));
    const dialog = await screen.findByTestId("pay-gridgo-dialog");
    expect(within(dialog).getByTestId("pay-gridgo-amount")).toHaveTextContent("₱38.00");
    expect(within(dialog).getByTestId("pay-gridgo-reference")).toHaveTextContent("GG-PAY-7Q2K");
    expect(within(dialog).getByRole("img", { name: "GRIDGO's QR Ph code" })).toHaveAttribute(
      "src",
      expect.stringContaining("/public/payment-qr?v=file_1"),
    );
    expect(dialog).toHaveTextContent("Due today, 6:00 PM.");
    expect(dialog).toHaveTextContent("The GRIDGO team checks the payment arrived and confirms it.");
    expect(dialog).not.toHaveTextContent(/automatic/i);
  });

  it("copies the Pay GRIDGO reference", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    api.getMyShopMoney.mockResolvedValue(money(OWING));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Pay ₱38.00" }));
    await userEvent.click(await screen.findByTestId("pay-gridgo-copy"));
    expect(writeText).toHaveBeenCalledWith("GG-PAY-7Q2K");
    expect(await screen.findByTestId("pay-gridgo-copy")).toHaveTextContent("Reference copied");
  });

  it("says new orders are paused after 6 PM, and what still works", async () => {
    vi.setSystemTime(MONDAY_7PM);
    api.getMyShopMoney.mockResolvedValue(
      money({ ...OWING, balances: { ...OWING.balances, overdue: true, paused: true } }),
    );
    renderPage();

    const paused = await screen.findByTestId("pay-gridgo-paused");
    expect(paused).toHaveTextContent("New orders are paused");
    expect(paused).toHaveTextContent(
      "You owe GRIDGO ₱38.00. Jobs you already accepted can still be finished. New orders come back once the GRIDGO team confirms your payment.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Pay ₱38.00" }));
    const dialog = await screen.findByTestId("pay-gridgo-dialog");
    expect(dialog).toHaveTextContent("New orders are paused until the GRIDGO team confirms this payment.");
    expect(dialog).toHaveTextContent("new orders reopen then.");
  });

  it("asks the team for the QR when GRIDGO has none on file", async () => {
    api.getMyShopMoney.mockResolvedValue(
      money({ ...OWING, payGridgo: { ...OWING.payGridgo, qrImageUrl: null } }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Pay ₱38.00" }));
    expect(await screen.findByText("Ask the GRIDGO team in chat for the QR.")).toBeInTheDocument();
  });

  it("shows the launch bonus during launch week, per job too", async () => {
    api.getMyShopMoney.mockResolvedValue(
      money({
        jobs: [
          { orderId: "ord_aa", createdAt: "2026-11-22T05:00:00.000Z", clientPayment: { methods: ["in_app_qr"], settlement: "daily" }, shopPayMinor: 7200, bonus: bonus(1440) },
          { orderId: "ord_bb", createdAt: "2026-11-21T05:00:00.000Z", clientPayment: { methods: ["in_app_qr"], settlement: "staged" }, shopPayMinor: 7200, bonus: bonus(1440) },
        ],
      }),
    );
    renderPage();

    const card = await screen.findByTestId("launch-bonus");
    expect(within(card).getByTestId("launch-bonus-total")).toHaveTextContent("+₱28.80");
    expect(within(card).getByTestId("launch-bonus-line")).toHaveTextContent(
      "+20% on your shop pay until Fri, 27 Nov, 10:00 AM, up to ₱500.00 in all.",
    );
    expect(card).toHaveTextContent("₱28.80 of ₱500.00 · 2 jobs");
    expect(within(card).getByRole("meter")).toHaveAttribute("aria-valuenow", "28.8");
    expect(screen.getByTestId("money-job-ord_aa")).toHaveTextContent("+₱14.40 launch bonus");
    expect(screen.getByTestId("money-job-ord_bb")).toHaveTextContent("Paid in parts");
  });

  it("says when the launch bonus reached its cap", async () => {
    api.getMyShopMoney.mockResolvedValue(
      money({
        jobs: [
          { orderId: "ord_aa", createdAt: "2026-11-22T05:00:00.000Z", clientPayment: { methods: ["in_app_qr"], settlement: "daily" }, shopPayMinor: 250000, bonus: bonus(50000) },
        ],
      }),
    );
    renderPage();
    const card = await screen.findByTestId("launch-bonus");
    expect(within(card).getByTestId("launch-bonus-line")).toHaveTextContent(
      "You reached the ₱500.00 launch bonus cap. Jobs keep paying your usual shop pay.",
    );
  });

  it("draws Money as before when GRIDGO does not offer the route", async () => {
    api.getMyShopMoney.mockResolvedValue(null);
    api.getShopMoneySchedule.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText(/You are paid in parts of your own price/)).toBeInTheDocument();
    await waitFor(() => expect(api.getMyShopMoney).toHaveBeenCalled());
    expect(screen.queryByTestId("shop-balances")).toBeNull();
    expect(screen.queryByTestId("staged-heading")).toBeNull();
    expect(screen.queryByTestId("how-you-earn")).toBeNull();
  });
});

describe("Staff, Managers and PIN workers", () => {
  it.each([
    ["Staff", { id: "shop_1", role: "staff" }],
    ["a Manager", { id: "shop_1", role: "manager" }],
    ["a PIN worker on the Owner's shop PC", { id: "shop_1", role: "owner", worker: { pinStaffId: "p1", name: "Worker", role: "staff" } }],
  ])("never reads %s's shop money or shows an amount", async (_who, shop) => {
    api.getMyShopMoney.mockResolvedValue(money(OWING));
    renderPage(shop as Partial<ShopSummary>);
    await screen.findByText(/You are paid in parts of your own price/);
    expect(api.getMyShopMoney).not.toHaveBeenCalled();
    expect(api.getShopMoneySchedule).not.toHaveBeenCalled();
    expect(screen.queryByTestId("shop-balances")).toBeNull();
    expect(screen.queryByText(/GRIDGO owes you/)).toBeNull();
  });
});
