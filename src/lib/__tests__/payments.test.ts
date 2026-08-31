import { describe, expect, it } from "vitest";

import { paymentsAwaitingReview } from "@/app/ops/_lib/payments";
import { buildScheduleEvents } from "@/app/ops/_lib/schedule";
import { rollupFinance } from "@/app/admin/_lib/finance";
import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";
import { installmentsAwaitingConfirmation } from "@/lib/api/constraints";
import { presentPaymentProgress } from "@/lib/order-state";
import { listedInstallments, normalizePayments, paymentOf } from "@/lib/payments";

function record(
  partial: Partial<PaymentRecord> & Pick<PaymentRecord, "status">,
): PaymentRecord {
  return {
    amountMinor: 7500,
    method: "qr_manual",
    reference: null,
    submittedAt: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationSource: null,
    ...partial,
  };
}

function order(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: null,
    riderId: null,
    productId: "prod_x",
    title: partial.title ?? "Test order",
    quantity: 1,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Somewhere",
    zone: "davao_central",
    totalMinor: 10000,
    deliveryFeeMinor: 1500,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

describe("normalizePayments", () => {
  it("maps live API keys onto the portal downpayment and balance", () => {
    const mapped = normalizePayments({
      initial: record({ status: "pending_confirmation", amountMinor: 8000 }),
      final_online: record({ status: "not_submitted", amountMinor: 2000 }),
    });
    expect(mapped?.downpayment?.amountMinor).toBe(8000);
    expect(mapped?.balance?.amountMinor).toBe(2000);
    expect(listedInstallments(mapped)).toEqual(["downpayment", "balance"]);
  });

  it("keeps a pickup plan that only has the initial collection", () => {
    const mapped = normalizePayments({
      initial: record({ status: "not_submitted", amountMinor: 10000 }),
    });
    expect(listedInstallments(mapped)).toEqual(["downpayment"]);
    expect(paymentOf(mapped, "balance")).toBeUndefined();
  });

  it("does not invent installments on an unpriced order", () => {
    expect(normalizePayments(undefined)).toBeUndefined();
    expect(normalizePayments({})).toBeUndefined();
    expect(listedInstallments(order({ id: "bare", state: "needs_qa" }))).toEqual([]);
  });
});

describe("live money schedule on Operations screens", () => {
  const livePending = order({
    id: "ord_live",
    state: "needs_qa",
    title: "Flyers",
    payments: {
      initial: record({
        status: "pending_confirmation",
        amountMinor: 8000,
        submittedAt: "2026-08-31T10:00:00.000Z",
      }),
      final_online: record({
        status: "not_submitted",
        amountMinor: 2000,
      }),
    } as unknown as OrderPayments,
  });

  it("queues the API initial installment as a downpayment to review", () => {
    const rows = paymentsAwaitingReview(
      [livePending],
      Date.parse("2026-08-31T11:00:00.000Z"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].installment).toBe("downpayment");
    expect(rows[0].payment.amountMinor).toBe(8000);
  });

  it("does not crash the schedule when the balance slot is missing", () => {
    const events = buildScheduleEvents([livePending], []);
    expect(
      events.some(
        (event) => event.kind === "payment_confirmation" && event.orderId === "ord_live",
      ),
    ).toBe(true);
  });

  it("does not crash QA payment progress when only the initial exists", () => {
    expect(presentPaymentProgress(livePending.payments).label).toBe(
      "Downpayment to confirm",
    );
    expect(installmentsAwaitingConfirmation(livePending)).toEqual(["downpayment"]);
  });

  it("counts API-keyed money in finance without requiring a balance", () => {
    const r = rollupFinance([livePending], []);
    expect(r.awaitingConfirmation).toEqual({ kind: "amount", minor: 8000 });
    expect(r.outstanding).toEqual({ kind: "amount", minor: 2000 });
    expect(r.confirmedIn).toEqual({ kind: "amount", minor: 0 });
  });
});
