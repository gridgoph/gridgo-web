import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));

import { PaymentSummary } from "@/components/orders/PaymentSummary";
import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";

function record(
  partial: Partial<PaymentRecord> & Pick<PaymentRecord, "status" | "amountMinor">,
): PaymentRecord {
  return {
    method: "qr_manual",
    reference: null,
    submittedAt: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationSource: null,
    ...partial,
  };
}

function order(payments: unknown): Order {
  return {
    id: "ord_live",
    clientId: "user_client",
    supplierId: null,
    riderId: null,
    state: "needs_qa",
    productId: "prod_x",
    title: "Flyers",
    quantity: 2,
    size: "A4",
    material: "matte",
    deadline: null,
    address: "Somewhere",
    zone: null,
    totalMinor: 10000,
    deliveryFeeMinor: 1500,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    payments: payments as OrderPayments,
  };
}

describe("PaymentSummary", () => {
  it("renders live API installment keys without reading a missing status", () => {
    const html = renderToStaticMarkup(
      <PaymentSummary
        order={order({
          initial: record({
            status: "pending_confirmation",
            amountMinor: 8000,
            submittedAt: "2026-08-31T10:00:00.000Z",
          }),
          final_online: record({
            status: "not_submitted",
            amountMinor: 2000,
          }),
        })}
      />,
    );
    expect(html).toContain("Downpayment");
    expect(html).toContain("Balance");
  });

  it("skips a pickup plan that has no second collection", () => {
    const html = renderToStaticMarkup(
      <PaymentSummary
        order={order({
          initial: record({ status: "not_submitted", amountMinor: 10000 }),
        })}
      />,
    );
    expect(html).toContain("Downpayment");
    expect(html).not.toContain("Balance (25%)");
  });
});
