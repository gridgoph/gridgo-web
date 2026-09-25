// @vitest-environment jsdom
/**
 * The Operations order workspace for an order paid 100% up front, beside one
 * placed on 75/25: one "Full payment" row and no balance anywhere, against the
 * two installments a 75/25 order keeps.
 */
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MoneyBreakdown } from "@/components/orders/MoneyBreakdown";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { PaymentSummary } from "@/components/orders/PaymentSummary";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";
import { normalizeOrder } from "@/lib/payments";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Receipt {fileId}</div>,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));

const record = (status: PaymentRecord["status"], amountMinor: number): PaymentRecord => ({
  status,
  amountMinor,
  method: "qr_manual",
  reference: status === "not_required" ? null : "GCASH-UPFRONT",
  submittedAt: status === "not_required" ? null : "2026-09-25T09:00:00Z",
  confirmedAt: status === "confirmed" ? "2026-09-25T09:05:00Z" : null,
  confirmedBy: null,
  confirmationSource: status === "confirmed" ? "manual_ops" : null,
});

function upfront(initial: PaymentRecord["status"] = "pending_confirmation"): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: initial === "confirmed" ? "payment_authorized" : "downpayment_review",
    title: "Tarpaulin",
    quantity: 1,
    size: "3x5 ft",
    material: "Tarpaulin",
    deadline: null,
    address: "Davao",
    supplierPriceMinor: 80000,
    serviceFeeRateBps: 1000,
    serviceFeeMinor: 8000,
    subtotalMinor: 88000,
    deliveryFeeMinor: 5000,
    totalMinor: 93000,
    downpaymentPercent: 100,
    downpaymentMinor: 93000,
    balanceMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: initial === "confirmed" ? "paid" : "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T08:00:00Z",
    updatedAt: "2026-09-25T09:00:00Z",
    timeline: [],
    payments: {
      initial: { ...record(initial, 93000), proofFileId: "upfront-receipt" },
      final_online: record("not_required", 0),
    } as unknown as OrderPayments,
  };
}

function split(): Order {
  return {
    ...upfront("confirmed"),
    downpaymentPercent: 75,
    downpaymentMinor: 69750,
    balanceMinor: 23250,
    payments: {
      initial: record("confirmed", 69750),
      final_online: record("pending_confirmation", 23250),
    } as unknown as OrderPayments,
  };
}

let order: Order;
let mutations: { path: string; body: unknown }[];

beforeEach(() => {
  vi.stubGlobal("React", React);
  order = upfront();
  mutations = [];
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === "POST") {
        mutations.push({ path, body: JSON.parse(String(init.body)) });
        order = upfront("confirmed");
      }
      return new Response(JSON.stringify({ order }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

function moneyRow(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling;
}

describe("OrderWorkspace, paid in full up front", () => {
  it("shows one full payment to confirm and no balance anywhere", async () => {
    render(<OrderWorkspace queueHref="/ops/orders" />);

    expect(await screen.findByText("Full payment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm this payment" })).toBeEnabled();
    expect(screen.getByText("Full payment of ₱930.00 is waiting on you.")).toBeInTheDocument();
    expect(moneyRow("Payment plan")).toHaveTextContent("In full at checkout");
    expect(screen.getByText("Payment needs confirming")).toBeInTheDocument();
    expect(screen.queryByText(/downpayment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/75%|25%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /balance/i })).not.toBeInTheDocument();
  });

  it("confirms the one payment and then reads Paid in full", async () => {
    render(<OrderWorkspace queueHref="/ops/orders" />);

    await userEvent.click(await screen.findByRole("button", { name: "Confirm this payment" }));

    expect(mutations).toEqual([{ path: "/orders/order1/payments/initial/confirm", body: {} }]);
    expect(await screen.findByText("Paid in full, ₱930.00 in.")).toBeInTheDocument();
    expect(moneyRow("Paid")).toHaveTextContent("₱930.00");
    expect(moneyRow("Remaining")).toHaveTextContent("₱0.00");
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument();
  });
});

describe("OrderWorkspace, placed on 75/25", () => {
  it("keeps the balance step and the order's own shares", async () => {
    order = split();
    render(<OrderWorkspace queueHref="/ops/orders" />);

    expect(await screen.findByText("Balance (25%)")).toBeInTheDocument();
    expect(screen.getByText("Downpayment (75%)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm balance payment" })).toBeEnabled();
    expect(moneyRow("Payment plan")).toHaveTextContent("75% now, 25% before delivery");
  });
});

describe("PaymentSummary and MoneyBreakdown", () => {
  it("render a single full payment for an upfront order", () => {
    const paid = normalizeOrder(upfront("confirmed"));
    const summary = renderToStaticMarkup(<PaymentSummary order={paid} />);
    expect(summary).toContain("Full payment");
    expect(summary).not.toContain("Balance");
    expect(summary).not.toContain("Nothing to pay");

    const money = renderToStaticMarkup(<MoneyBreakdown order={paid} headingId="money" />);
    expect(money).toContain("Full payment");
    expect(money).not.toContain("Balance");
    expect(money).not.toContain("75%");
  });

  it("keep both installments for a 75/25 order", () => {
    const owed = normalizeOrder(split());
    const summary = renderToStaticMarkup(<PaymentSummary order={owed} />);
    expect(summary).toContain("Downpayment (75%)");
    expect(summary).toContain("Balance (25%)");

    const money = within(
      render(<MoneyBreakdown order={owed} headingId="money" />).container,
    );
    expect(money.getByText("Downpayment (75%)")).toBeInTheDocument();
    expect(money.getByText("Balance (25%)")).toBeInTheDocument();
    expect(money.getByText("₱232.50")).toBeInTheDocument();
  });
});
