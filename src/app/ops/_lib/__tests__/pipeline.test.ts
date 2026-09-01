import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";

import {
  STAGES,
  actionableCount,
  ordersInStage,
  stageCounts,
  stageNeedsOperations,
  stageOf,
  stepsFor,
} from "../pipeline";

function order(state: string, extra: Partial<Order> = {}): Order {
  return { id: `ord_${state}`, state, ...extra } as Order;
}

describe("the order pipeline", () => {
  it("puts every state an order can reach into exactly one stage", () => {
    const states = [
      "draft", "submitted", "awaiting_initial_payment", "initial_payment_review",
      "awaiting_downpayment", "downpayment_review", "awaiting_checkout",
      "needs_qa", "client_correction", "proof_approval",
      "approved_for_matching", "supplier_assigned", "payment_authorized",
      "production", "supplier_self_qc", "ready_for_dispatch",
      "rider_assigned", "picked_up", "out_for_delivery", "delivered", "issue_window_open",
      "completed", "payout_released", "cancelled",
    ];
    for (const state of states) {
      const stage = stageOf(order(state));
      expect(STAGES.some((entry) => entry.id === stage), `${state} -> ${stage}`).toBe(true);
    }
  });

  it("holds the order of the work: money, then artwork, then the shop", () => {
    expect(stageOf(order("initial_payment_review"))).toBe("payment");
    expect(stageOf(order("needs_qa"))).toBe("qa");
    // The shop only ever sees an order that has cleared both.
    expect(stageOf(order("supplier_assigned"))).toBe("production");
  });

  it("counts as actionable only what Operations can actually do something about", () => {
    const waiting = order("initial_payment_review", {
      payments: { downpayment: { status: "pending_confirmation" } },
    } as Partial<Order>);
    const paid = order("initial_payment_review", {
      payments: { downpayment: { status: "confirmed" } },
    } as Partial<Order>);
    expect(stageNeedsOperations(waiting)).toBe(true);
    expect(stageNeedsOperations(paid)).toBe(false);

    // A fresh check is ours; a correction is with the client.
    expect(stageNeedsOperations(order("needs_qa"))).toBe(true);
    expect(stageNeedsOperations(order("client_correction"))).toBe(false);

    // Nothing in production or delivery is waiting on Operations. A queue that
    // counts work nobody can act on teaches people to stop reading the counts.
    expect(stageNeedsOperations(order("production"))).toBe(false);
    expect(stageNeedsOperations(order("out_for_delivery"))).toBe(false);
  });

  it("splits a book of orders across the stages without losing any", () => {
    const orders = [
      order("initial_payment_review"),
      order("needs_qa"),
      order("needs_qa"),
      order("production"),
      order("delivered"),
      order("completed"),
      order("cancelled"),
    ];
    const counts = stageCounts(orders);
    expect(counts).toEqual({ payment: 1, qa: 2, production: 1, delivery: 1, done: 2 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(orders.length);
    expect(ordersInStage(orders, "qa")).toHaveLength(2);
    expect(actionableCount(orders, "qa")).toBe(2);
    expect(actionableCount(orders, "done")).toBe(0);
  });

  it("makes exactly one step current, with everything ahead of it locked", () => {
    const steps = stepsFor(order("needs_qa"));
    expect(steps.map((step) => step.id)).toEqual(["payment", "qa", "production", "delivery"]);
    expect(steps.map((step) => step.status)).toEqual(["done", "current", "locked", "locked"]);

    // A screen cannot invite anybody to approve artwork on an order whose
    // payment has not cleared.
    expect(stepsFor(order("initial_payment_review")).map((step) => step.status))
      .toEqual(["current", "locked", "locked", "locked"]);
    expect(stepsFor(order("out_for_delivery")).map((step) => step.status))
      .toEqual(["done", "done", "done", "current"]);
    expect(stepsFor(order("completed")).every((step) => step.status === "done")).toBe(true);
  });
});
