import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";

import {
  OPERATIONS_ACTION_LABEL,
  OPERATIONS_ACTIONS,
  actionableCount,
  operationsAction,
  ordersForAction,
  waitingOnOperationsCount,
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
