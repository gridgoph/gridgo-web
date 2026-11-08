// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";
import { apiInstallment } from "@/lib/payments";

/**
 * Review of gridgo-web#277: a 75/25 balance sent while the order is on the
 * road still waits on Operations, and a ready order the API will not dispatch
 * (a declined deadline request holding work) is not Assign rider.
 */

vi.stubGlobal("React", React);
const listOrders = vi.hoisted(() => vi.fn());
const getSettings = vi.hoisted(() => vi.fn());
const getOrder = vi.hoisted(() => vi.fn());
const confirmPayment = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  listOrders,
  getSettings,
  getOrder,
  confirmPayment,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { default: OpsOrdersPage } = await import("@/app/ops/orders/page");

function order(id: string, title: string, state: string, extra: object = {}): Order {
  return {
    id,
    title,
    state,
    clientId: "client1",
    quantity: 1,
    totalMinor: 74600,
    timeline: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...extra,
  } as unknown as Order;
}

// The API's own installment keys.
const balance = order("ord_final", "Balance pending", "out_for_delivery", {
  downpaymentPercent: 75,
  balanceMinor: 18650,
  payments: {
    initial: {
      status: "confirmed",
      amountMinor: 55950,
      method: "qr_manual",
      reference: "DOWN",
    },
    final_online: {
      status: "pending_confirmation",
      amountMinor: 18650,
      method: "qr_manual",
      reference: "BAL",
      submittedAt: "2026-11-08T03:00:00Z",
    },
  },
});
const held = order("ord_held", "Held banner", "ready_for_dispatch", {
  rescheduleRequest: {
    id: "rr1",
    status: "declined",
    resolution: "operations_required",
    workHeld: true,
  },
});
const ready = order("ord_ready", "Free banner", "ready_for_dispatch");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-09T02:00:00Z") });
  getSettings.mockResolvedValue({});
  listOrders.mockResolvedValue([balance, held, ready]);
  getOrder.mockImplementation(async (id: string) =>
    [balance, held, ready].find((row) => row.id === id),
  );
  confirmPayment.mockResolvedValue(balance);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("confirms a balance sent on the road from the queue, and leaves a held dispatch out", async () => {
  render(<OpsOrdersPage />);

  expect(await screen.findByRole("heading", { name: "Confirm payment 1" })).toBeVisible();
  const payments = within(screen.getByRole("region", { name: "Confirm payment" })).getByRole(
    "table",
  );
  const row = within(payments).getByText("Balance pending").closest("tr")!;

  const rider = screen.getByRole("region", { name: "Assign rider" });
  expect(within(rider).getByRole("heading", { name: "Assign rider 1" })).toBeVisible();
  expect(within(rider).queryByText("Held banner")).not.toBeInTheDocument();

  // The held order rests with the shop, saying why, with no assignment offered.
  const shop = screen.getByRole("table", { name: "Orders at With the shop" });
  const heldRow = within(shop).getByText("Held banner").closest("tr")!;
  expect(heldRow).toHaveTextContent("Paused: deadline request");
  expect(within(heldRow).queryByRole("button", { name: "Assign rider" })).not.toBeInTheDocument();

  // Needs action counts the balance and the free dispatch only.
  expect(screen.getByRole("button", { name: /Needs action/ })).toHaveTextContent("2");

  fireEvent.click(within(row).getByRole("button", { name: "Confirm payment" }));
  const confirm = await screen.findByRole("button", { name: "Confirm balance payment" });
  fireEvent.click(confirm);
  await vi.waitFor(() => expect(confirmPayment).toHaveBeenCalledWith("ord_final", "balance"));
  expect(apiInstallment("balance")).toBe("final_online");
});
