/**
 * 100% upfront checkout (gridgo-api#66) beside the 75/25 orders placed before it.
 *
 * An upfront order carries `downpaymentPercent: 100`, `balanceMinor: 0`, and a
 * ₱0 balance installment with status `not_required`. Every screen reads it as
 * one full payment; a 75/25 order keeps its balance step exactly as before.
 */

import { describe, expect, it } from "vitest";

import { stageSummary } from "@/app/ops/_lib/pipeline";
import { buildOverviewBuckets, pickOverviewNextAction } from "@/app/ops/_lib/overview";
import { ordersAwaitingClientPayment, paymentsAwaitingReview } from "@/app/ops/_lib/payments";
import { buildScheduleEvents } from "@/app/ops/_lib/schedule";
import {
  canSubmitBalance,
  installmentsAwaitingConfirmation,
  milestoneReleaseBlocker,
  paymentIsSettled,
} from "@/lib/api/constraints";
import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";
import { presentInstallment, presentPaymentProgress, presentPaymentStatus } from "@/lib/order-state";
import {
  balanceNotRequired,
  downpaymentPercentOf,
  installmentLabel,
  listedInstallments,
  normalizeOrder,
  paymentPlanLabel,
} from "@/lib/payments";

const peso = (minor: number) => `₱${(minor / 100).toFixed(2)}`;

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

function base(partial: Partial<Order>): Order {
  return normalizeOrder({
    id: "ord_1",
    clientId: "user_client",
    supplierId: "shop_1",
    riderId: null,
    state: "downpayment_review",
    title: "Tarpaulin",
    quantity: 1,
    size: "3x5 ft",
    material: "Tarpaulin",
    deadline: null,
    address: "Davao",
    totalMinor: 100000,
    deliveryFeeMinor: 5000,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T08:00:00.000Z",
    updatedAt: "2026-09-25T08:00:00.000Z",
    timeline: [],
    ...partial,
  } as Order);
}

/** A new order, as the API writes it at checkout. */
function upfront(
  initial: PaymentRecord["status"] = "pending_confirmation",
  partial: Partial<Order> = {},
): Order {
  return base({
    downpaymentPercent: 100,
    downpaymentMinor: 100000,
    balanceMinor: 0,
    payments: {
      initial: record({
        status: initial,
        amountMinor: 100000,
        submittedAt: "2026-09-25T09:00:00.000Z",
      }),
      final_online: record({ status: "not_required", amountMinor: 0 }),
    } as unknown as OrderPayments,
    ...partial,
  });
}

/** An order placed on 75/25 before the switch. */
function split(
  initial: PaymentRecord["status"] = "confirmed",
  final: PaymentRecord["status"] = "not_submitted",
  partial: Partial<Order> = {},
): Order {
  return base({
    downpaymentPercent: 75,
    downpaymentMinor: 75000,
    balanceMinor: 25000,
    payments: {
      initial: record({ status: initial, amountMinor: 75000 }),
      final_online: record({
        status: final,
        amountMinor: 25000,
        submittedAt: final === "pending_confirmation" ? "2026-09-25T09:00:00.000Z" : null,
      }),
    } as unknown as OrderPayments,
    ...partial,
  });
}

describe("reading the split from the order", () => {
  it("takes an upfront order as one full payment", () => {
    const order = upfront();
    expect(balanceNotRequired(order)).toBe(true);
    expect(downpaymentPercentOf(order)).toBe(100);
    expect(installmentLabel(order, "downpayment")).toBe("Full payment");
    expect(presentInstallment("downpayment", order)).toBe("Full payment");
    expect(listedInstallments(order)).toEqual(["downpayment"]);
    expect(paymentPlanLabel(order)).toBe("In full at checkout");
  });

  it("recognises an upfront order by any one of its three signs", () => {
    // Only the ₱0 balance (an API without `downpaymentPercent`).
    expect(balanceNotRequired({ balanceMinor: 0, payments: undefined })).toBe(true);
    // Only the `not_required` status, read from a payments-only slice.
    expect(
      balanceNotRequired({
        final_online: record({ status: "not_required", amountMinor: 0 }),
      } as unknown as OrderPayments),
    ).toBe(true);
    // Only the snapshot.
    expect(balanceNotRequired({ downpaymentPercent: 100, payments: undefined })).toBe(true);
  });

  it("keeps a 75/25 order on its own shares", () => {
    const order = split();
    expect(balanceNotRequired(order)).toBe(false);
    expect(downpaymentPercentOf(order)).toBe(75);
    expect(presentInstallment("downpayment", order)).toBe("Downpayment (75%)");
    expect(presentInstallment("balance", order)).toBe("Balance (25%)");
    expect(listedInstallments(order)).toEqual(["downpayment", "balance"]);
    expect(paymentPlanLabel(order)).toBe("75% now, 25% before delivery");
  });

  it("reads a legacy order with no snapshot as 75/25", () => {
    const order = split("confirmed", "not_submitted", { downpaymentPercent: undefined });
    expect(downpaymentPercentOf(order)).toBe(75);
    expect(presentInstallment("balance", order)).toBe("Balance (25%)");
  });

  it("lets a balance still owed win over a contradicting snapshot", () => {
    const order = split("confirmed", "not_submitted", { downpaymentPercent: 100 });
    expect(balanceNotRequired(order)).toBe(false);
    expect(presentInstallment("downpayment", order)).toBe("Downpayment (75%)");
  });

  it("names a not_required installment calmly rather than as unknown", () => {
    expect(presentPaymentStatus("not_required").label).toBe("Nothing to pay");
    // Anything else the API adds later still reads as a payment, not an error.
    expect(presentPaymentStatus("something_new").label).toBe("Payment");
  });
});

describe("gates", () => {
  it("treats a not_required balance as settled", () => {
    expect(paymentIsSettled({ status: "not_required" })).toBe(true);
  });

  it("never asks for a balance on an upfront order", () => {
    expect(canSubmitBalance(upfront("confirmed"))).toBe(false);
    expect(canSubmitBalance(split("confirmed"))).toBe(true);
    expect(canSubmitBalance(split("pending_confirmation"))).toBe(false);
  });

  it("releases the delivered share on an upfront order without balance copy", () => {
    const delivered = { code: "delivered", status: "pof_attached", pofFileIds: ["pof_1"] };
    const at = {
      state: "delivered",
      deliveryEvidence: { recordedAt: "2026-09-26T10:00:00.000Z" } as Order["deliveryEvidence"],
    };
    expect(milestoneReleaseBlocker(upfront("confirmed", at), delivered)).toBeNull();
    expect(milestoneReleaseBlocker(split("confirmed", "not_submitted", at), delivered)).toBe(
      "The delivered share releases once the client's balance is confirmed.",
    );
    expect(milestoneReleaseBlocker(split("confirmed", "confirmed", at), delivered)).toBeNull();
  });
});

describe("Operations queues", () => {
  it("queues the full payment once and never a balance", () => {
    const order = upfront();
    expect(installmentsAwaitingConfirmation(order)).toEqual(["downpayment"]);
    const rows = paymentsAwaitingReview([order], Date.parse("2026-09-25T10:00:00.000Z"));
    expect(rows.map((row) => [row.installment, row.expectedMinor])).toEqual([
      ["downpayment", 100000],
    ]);
  });

  it("never lists a paid-up-front order as waiting for its balance", () => {
    const paid = upfront("confirmed", { state: "production" });
    const owed = split("confirmed", "not_submitted", { state: "production" });
    expect(ordersAwaitingClientPayment([paid, owed]).map((o) => o.downpaymentPercent)).toEqual([
      75,
    ]);
  });

  it("summarises the payment step in the order's own words", () => {
    expect(stageSummary(upfront(), "payment", peso, (iso) => iso)).toBe(
      "Full payment of ₱1000.00 is waiting on you.",
    );
    expect(
      stageSummary(upfront("not_submitted"), "payment", peso, (iso) => iso),
    ).toBe("Full payment of ₱1000.00 not sent yet.");
    expect(stageSummary(upfront("confirmed"), "payment", peso, (iso) => iso)).toBe(
      "Paid in full, ₱1000.00 in.",
    );
    expect(stageSummary(split("pending_confirmation"), "payment", peso, (iso) => iso)).toBe(
      "Downpayment of ₱750.00 is waiting on you.",
    );
    expect(stageSummary(split("confirmed"), "payment", peso, (iso) => iso)).toBe(
      "Downpayment in. Balance of ₱250.00 not sent yet.",
    );
  });

  it("rolls the payment up as Paid in full, or as a full payment to confirm", () => {
    expect(presentPaymentProgress(upfront()).label).toBe("Full payment to confirm");
    expect(presentPaymentProgress(upfront("confirmed")).label).toBe("Paid in full");
    // A payments-only slice still knows from the not_required balance.
    expect(presentPaymentProgress(upfront("confirmed").payments).label).toBe("Paid in full");
    expect(presentPaymentProgress(split("pending_confirmation")).label).toBe(
      "Downpayment to confirm",
    );
    expect(presentPaymentProgress(split("confirmed")).label).toBe("Downpayment in");
  });

  it("names the full payment on the schedule and the overview", () => {
    const [event] = buildScheduleEvents([upfront()], []).filter(
      (e) => e.kind === "payment_confirmation",
    );
    expect(event.detail).toBe("The client's full payment is waiting on Operations");
    expect(
      buildScheduleEvents([split("confirmed", "pending_confirmation", { state: "out_for_delivery" })], [])
        .find((e) => e.kind === "payment_confirmation")?.detail,
    ).toBe("The client's balance is waiting on Operations");

    expect(pickOverviewNextAction([upfront()], [], [])?.title).toBe("Confirm a full payment");
    expect(pickOverviewNextAction([split("pending_confirmation")], [], [])?.title).toBe(
      "Confirm a downpayment",
    );
    const bucket = buildOverviewBuckets([upfront()]).find((b) => b.id === "payment_confirmation");
    expect(bucket?.count).toBe(1);
  });
});
