import { describe, expect, it } from "vitest";

import type { OperatingHours, Order } from "@/lib/api/types";

import {
  OPERATIONS_ACTION_LABEL,
  OPERATIONS_ACTIONS,
  actionableCount,
  confirmPaymentWaitAt,
  operationsAction,
  ordersForAction,
  pendingInstallment,
  waitingOnOperationsCount,
  workHoldLabel,
  workHoldOf,
} from "../pipeline";

function order(id: string, state: string, extra: Partial<Order> = {}): Order {
  return {
    id,
    state,
    timeline: [],
    updatedAt: "2026-10-30T00:00:00Z",
    ...extra,
  } as Order;
}

function pending(submittedAt: string | null) {
  return {
    payments: {
      downpayment: { status: "pending_confirmation", amountMinor: 1000, submittedAt },
    },
  } as unknown as Partial<Order>;
}

describe("the action groups", () => {
  it("names the four kinds of work, with no ranking and no late group", () => {
    expect(OPERATIONS_ACTIONS).toEqual([
      "confirm_payment",
      "check_artwork",
      "review_finished",
      "assign_rider",
    ]);
    expect(OPERATIONS_ACTIONS.map((action) => OPERATIONS_ACTION_LABEL[action])).toEqual([
      "Confirm payment",
      "Check the artwork",
      "Review finished work",
      "Assign rider",
    ]);
  });

  it("puts a payment waiting since yesterday ahead of one waiting since today", () => {
    const today = order("today", "initial_payment_review", {
      ...pending("2026-10-31T05:00:00Z"),
      updatedAt: "2026-10-01T00:00:00Z",
    });
    const yesterday = order("yesterday", "initial_payment_review", {
      ...pending("2026-10-30T05:00:00Z"),
      updatedAt: "2026-10-31T08:00:00Z",
    });
    expect(ordersForAction([today, yesterday], "confirm_payment").map((row) => row.id)).toEqual([
      "yesterday",
      "today",
    ]);
  });

  it("uses when the order last moved when the payment has no submitted time", () => {
    const stamped = order("stamped", "initial_payment_review", pending("2026-10-31T05:00:00Z"));
    const unstamped = order("unstamped", "initial_payment_review", {
      ...pending(null),
      updatedAt: "2026-10-29T00:00:00Z",
    });
    expect(ordersForAction([stamped, unstamped], "confirm_payment").map((row) => row.id)).toEqual([
      "unstamped",
      "stamped",
    ]);
  });

  it("keeps a needs_qa order in the artwork group only", () => {
    const artwork = order("art", "needs_qa", pending("2026-10-30T00:00:00Z"));
    expect(operationsAction(artwork)).toBe("check_artwork");
    expect(ordersForAction([artwork], "confirm_payment")).toEqual([]);
    expect(ordersForAction([artwork], "check_artwork").map((row) => row.id)).toEqual(["art"]);
  });

  it("puts a ready order with a pending pin payment under Confirm payment, not Assign rider", () => {
    const held = order("held", "ready_for_dispatch", {
      deliveryPin: {
        change: {
          status: "pending_confirmation",
          payment: { submittedAt: "2026-10-31T03:00:00Z" },
        },
      },
    } as unknown as Partial<Order>);
    expect(operationsAction(held)).toBe("confirm_payment");
    expect(ordersForAction([held], "assign_rider")).toEqual([]);
  });

  it("puts a ready order with no pin block under Assign rider, oldest update first", () => {
    const newer = order("newer", "ready_for_dispatch", { updatedAt: "2026-10-31T05:00:00Z" });
    const older = order("older", "ready_for_dispatch", { updatedAt: "2026-10-30T05:00:00Z" });
    expect(ordersForAction([newer, older], "assign_rider").map((row) => row.id)).toEqual([
      "older",
      "newer",
    ]);
  });

  it("puts finished work that is waiting for review in that group, oldest submission first", () => {
    const newer = review("newer", "2026-10-31T04:00:00Z");
    const older = review("older", "2026-10-30T04:00:00Z");
    expect(ordersForAction([newer, older], "review_finished").map((row) => row.id)).toEqual([
      "older",
      "newer",
    ]);
  });

  it("leaves a late production order that owes nothing out of every group", () => {
    const late = order("late", "production", { deadline: "2026-10-01T00:00:00Z" });
    expect(operationsAction(late)).toBeNull();
    for (const action of OPERATIONS_ACTIONS) {
      expect(ordersForAction([late], action)).toEqual([]);
    }
  });

  it("counts the same orders the groups list, including a rider and a review", () => {
    const transfer = order("pay", "initial_payment_review", pending("2026-10-31T01:00:00Z"));
    const artwork = order("art", "needs_qa");
    const rider = order("rider", "ready_for_dispatch");
    const finished = review("finished", "2026-10-30T01:00:00Z");
    const late = order("late", "production", { deadline: "2026-10-01T00:00:00Z" });
    const book = [transfer, artwork, rider, finished, late];
    expect(waitingOnOperationsCount(book)).toBe(4);
    expect(actionableCount(book, "payment")).toBe(1);
    expect(actionableCount(book, "qa")).toBe(1);
    expect(actionableCount(book, "production")).toBe(2);
    expect(actionableCount(book, "delivery")).toBe(0);
  });
});

function review(id: string, at: string): Order {
  return order(id, "supplier_self_qc", {
    supplierId: "shop1",
    handoverFlow: "rider_packs",
    shopHandover: {
      finished: { at, by: "shop1", supplierId: "shop1", photoFileIds: ["file_a"] },
      review: null,
    },
  } as Partial<Order>);
}

describe("a 75/25 balance waiting after the payment stage", () => {
  // The API's own keys: `initial` and `final_online`, as `GET /orders` sends them.
  function balancePending(state: string): Order {
    return order(`bal_${state}`, state, {
      downpaymentPercent: 75,
      payments: {
        initial: { status: "confirmed", amountMinor: 55950 },
        final_online: {
          status: "pending_confirmation",
          amountMinor: 18650,
          submittedAt: "2026-11-08T03:00:00Z",
        },
      },
    } as unknown as Partial<Order>);
  }

  it.each(["production", "awaiting_collection", "out_for_delivery"])(
    "keeps a pending final installment under Confirm payment while %s",
    (state) => {
      const row = balancePending(state);
      expect(pendingInstallment(row)).toBe("balance");
      expect(operationsAction(row)).toBe("confirm_payment");
      expect(ordersForAction([row], "confirm_payment").map((o) => o.id)).toEqual([row.id]);
      expect(waitingOnOperationsCount([row])).toBe(1);
      expect(confirmPaymentWaitAt(row)).toBe("2026-11-08T03:00:00Z");
    },
  );

  it("does not list a confirmed balance or a finished order", () => {
    const paid = order("paid", "out_for_delivery", {
      payments: {
        initial: { status: "confirmed", amountMinor: 1 },
        final_online: { status: "confirmed", amountMinor: 1 },
      },
    } as unknown as Partial<Order>);
    const done = { ...balancePending("completed"), id: "done" } as Order;
    expect(operationsAction(paid)).toBeNull();
    expect(operationsAction(done)).toBeNull();
    expect(waitingOnOperationsCount([paid, done])).toBe(0);
  });
});

describe("a ready order the API will not dispatch", () => {
  const ready = (id: string, extra: Partial<Order> = {}) =>
    order(id, "ready_for_dispatch", extra);

  // Open every day, 08:00–17:00 Manila.
  const hours = {
    timeZone: "Asia/Manila",
    schedule: {
      utcOffsetMinutes: 480,
      week: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        opensMinute: 8 * 60,
        closesMinute: 17 * 60,
      })),
      closures: [],
    },
    artworkReviewMinutes: 30,
  } as unknown as OperatingHours;
  const open = { hours, nowMs: Date.parse("2026-11-09T02:00:00Z") }; // 10:00 Manila
  const closed = { hours, nowMs: Date.parse("2026-11-09T12:00:00Z") }; // 20:00 Manila

  const held = [
    ready("deadline", {
      rescheduleRequest: {
        status: "declined",
        resolution: "operations_required",
        workHeld: true,
      },
    } as unknown as Partial<Order>),
    ready("recovery", {
      shopRecovery: { status: "ops_review" },
    } as unknown as Partial<Order>),
    ready("refund", { refundHold: true }),
    ready("settled", { refundDisposition: "fulfilled_with_refund" }),
  ];

  it.each(held.map((row) => [row.id, row] as const))(
    "holds %s out of Assign rider and the count",
    (_, row) => {
      expect(workHoldOf(row, open)).not.toBeNull();
      expect(operationsAction(row, open)).toBeNull();
      expect(ordersForAction([row], "assign_rider", open)).toEqual([]);
      expect(waitingOnOperationsCount([row], open)).toBe(0);
      expect(actionableCount([row], "production", open)).toBe(0);
    },
  );

  it("names each hold calmly", () => {
    expect(held.map((row) => workHoldLabel(workHoldOf(row, open)!, open))).toEqual([
      "Paused: deadline request",
      "Paused: shop change",
      "Paused: refund",
      "Paused: refund",
    ]);
  });

  it("counts a free ready order and leaves held ones out", () => {
    const free = ready("free");
    const accepted = ready("accepted", {
      shopRecovery: { status: "accepted" },
      rescheduleRequest: { status: "declined", resolution: "rematched", workHeld: false },
      refundDisposition: "delivery_adjustment",
    } as unknown as Partial<Order>);
    expect(operationsAction(free, open)).toBe("assign_rider");
    expect(operationsAction(accepted, open)).toBe("assign_rider");
    expect(waitingOnOperationsCount([free, accepted, ...held], open)).toBe(2);
  });

  it("follows the API's dispatch offers for hours, never GRIDGO's schedule alone", () => {
    // Before 08:00. The legacy order has no hours snapshot, so the API still
    // offers it and assigns it; the snapshotted one waits.
    const legacy = ready("legacy");
    const snapshotted = ready("snapshotted");
    const night = { ...closed, dispatchable: new Set(["legacy"]) };
    expect(operationsAction(legacy, night)).toBe("assign_rider");
    expect(workHoldOf(snapshotted, night)).toBe("not_offered");
    expect(operationsAction(snapshotted, night)).toBeNull();
    expect(waitingOnOperationsCount([legacy, snapshotted], night)).toBe(1);
    expect(actionableCount([legacy, snapshotted], "production", night)).toBe(1);
    expect(workHoldLabel("not_offered", night)).toBe("Dispatch tomorrow, 8:00 AM");

    // GRIDGO open but not offered: the shop's own dispatch hours.
    const day = { ...open, dispatchable: new Set<string>() };
    expect(operationsAction(snapshotted, day)).toBeNull();
    expect(workHoldLabel("not_offered", day)).toBe("Dispatch when the shop opens");

    // Offers unknown (a failed read): nothing is hidden on a guess, even at night.
    expect(operationsAction(snapshotted, closed)).toBe("assign_rider");
    expect(operationsAction(snapshotted, { ...closed, dispatchable: null })).toBe("assign_rider");

    // Offers leave out test orders for a real account; they say nothing here.
    const test = ready("test", { reviewData: true });
    expect(operationsAction(test, day)).toBe("assign_rider");

    // Independent stops still hold an order the offers would list.
    const both = { ...open, dispatchable: new Set(held.map((row) => row.id)) };
    expect(waitingOnOperationsCount(held, both)).toBe(0);
  });

  it("still lets a held order's payment be confirmed", () => {
    const row = ready("held_pay", {
      rescheduleRequest: { workHeld: true },
      payments: {
        initial: { status: "confirmed", amountMinor: 1 },
        final_online: { status: "pending_confirmation", amountMinor: 1 },
      },
    } as unknown as Partial<Order>);
    expect(operationsAction(row, open)).toBe("confirm_payment");
  });
});
