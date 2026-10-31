import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";

import {
  NEEDS_ACTIONS,
  buildNeedsActionQueue,
  needsActionCounts,
  needsActionOf,
  needsActionSortKey,
} from "../needs-action";
import { isSlaBreached } from "../overview";

const NOW = Date.parse("2026-10-31T06:00:00Z");

function order(id: string, state: string, extra: Partial<Order> = {}): Order {
  return {
    id,
    state,
    timeline: [],
    updatedAt: "2026-10-30T00:00:00Z",
    ...extra,
  } as Order;
}

function pending(submittedAt: string) {
  return {
    payments: {
      downpayment: { status: "pending_confirmation", amountMinor: 1000, submittedAt },
    },
  } as unknown as Partial<Order>;
}

describe("the needs-action queue", () => {
  it("lists the groups in the order the order flow reaches them", () => {
    expect(NEEDS_ACTIONS.map((entry) => entry.id)).toEqual([
      "payment",
      "artwork",
      "rider",
      "late",
    ]);
    expect(NEEDS_ACTIONS.map((entry) => entry.label)).toEqual([
      "Confirm payment",
      "Check artwork",
      "Assign rider",
      "Late",
    ]);
  });

  it("groups by the action owed, then puts the oldest wait first in each group", () => {
    const rows = buildNeedsActionQueue(
      [
        order("rider_new", "ready_for_dispatch", { readyAt: "2026-10-31T05:00:00Z" }),
        order("art_new", "needs_qa", {
          fileCheck: { status: "pending", requestedAt: "2026-10-31T04:00:00Z" },
        } as Partial<Order>),
        order("pay_new", "initial_payment_review", pending("2026-10-31T05:30:00Z")),
        order("late_one", "production", { deadline: "2026-10-30T09:00:00Z" }),
        order("rider_old", "ready_for_dispatch", { readyAt: "2026-10-30T05:00:00Z" }),
        order("pay_old", "initial_payment_review", pending("2026-10-31T01:00:00Z")),
        order("art_old", "needs_qa", {
          fileCheck: { status: "pending", requestedAt: "2026-10-31T02:00:00Z" },
        } as Partial<Order>),
        order("late_older", "production", { promisedDate: "2026-10-29T09:00:00Z" }),
        order("with_shop", "production", { deadline: "2026-11-05T09:00:00Z" }),
      ],
      NOW,
    );

    expect(rows.map((row) => row.order.id)).toEqual([
      "pay_old",
      "pay_new",
      "art_old",
      "art_new",
      "rider_old",
      "rider_new",
      "late_older",
      "late_one",
    ]);
    expect(rows.map((row) => row.action)).toEqual([
      "payment",
      "payment",
      "artwork",
      "artwork",
      "rider",
      "rider",
      "late",
      "late",
    ]);
    // The sortable column holds the same order.
    const keys = rows.map(needsActionSortKey);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
  });

  it("counts each action once per order", () => {
    const rows = buildNeedsActionQueue(
      [
        order("a", "initial_payment_review", pending("2026-10-31T01:00:00Z")),
        order("b", "initial_payment_review", pending("2026-10-31T02:00:00Z")),
        order("c", "needs_qa"),
        order("d", "ready_for_dispatch"),
        order("e", "production", { deadline: "2026-10-30T09:00:00Z" }),
        order("f", "production"),
      ],
      NOW,
    );
    expect(needsActionCounts(rows)).toEqual({
      payment: 2,
      artwork: 1,
      rider: 1,
      late: 1,
    });
    expect(needsActionCounts([])).toEqual({ payment: 0, artwork: 0, rider: 0, late: 0 });
  });

  it("keeps a late order in the step it owes, marked late, and lists it once", () => {
    const lateRider = order("late_rider", "ready_for_dispatch", {
      readyAt: "2026-10-30T05:00:00Z",
      deadline: "2026-10-30T09:00:00Z",
    });
    const rows = buildNeedsActionQueue([lateRider], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "rider", late: true });
  });

  it("puts a pin or change payment under Confirm payment, with no installment to confirm here", () => {
    const pin = order("pin", "ready_for_dispatch", {
      deliveryPin: {
        change: {
          status: "pending_confirmation",
          payment: { submittedAt: "2026-10-31T03:00:00Z" },
        },
      },
    } as unknown as Partial<Order>);
    const change = order("change", "production", {
      changeRequests: [
        {
          id: "chg_1",
          status: "pending_confirmation",
          payment: { submittedAt: "2026-10-31T02:00:00Z" },
        },
      ],
    } as unknown as Partial<Order>);
    const rows = buildNeedsActionQueue([pin, change], NOW);
    expect(rows.map((row) => [row.order.id, row.action, row.installment])).toEqual([
      ["change", "payment", null],
      ["pin", "payment", null],
    ]);
  });

  it("names the installment, the downpayment ahead of a balance", () => {
    const balance = order("bal", "out_for_delivery", {
      payments: {
        downpayment: { status: "confirmed", amountMinor: 750 },
        balance: { status: "pending_confirmation", amountMinor: 250, submittedAt: null },
      },
    } as unknown as Partial<Order>);
    expect(needsActionOf(balance, NOW)).toMatchObject({
      action: "payment",
      installment: "balance",
    });
    expect(
      needsActionOf(
        order("dp", "initial_payment_review", pending("2026-10-31T01:00:00Z")),
        NOW,
      ),
    ).toMatchObject({ installment: "downpayment", since: "2026-10-31T01:00:00Z" });
  });

  it("owes nothing for orders with the client, the shop, a rider, or finished", () => {
    for (const state of [
      "awaiting_initial_payment",
      "client_correction",
      "production",
      "rider_assigned",
      "out_for_delivery",
      "completed",
      "cancelled",
    ]) {
      expect(needsActionOf(order(state, state), NOW), state).toBeNull();
    }
    // A finished, cancelled or delivered order past its date is not late any more.
    for (const state of ["cancelled", "completed", "delivered"]) {
      expect(
        needsActionOf(order(state, state, { deadline: "2026-10-01T00:00:00Z" }), NOW),
        state,
      ).toBeNull();
    }
  });

  it("keeps the overview's late rule: an overdue order on the counter is still late", () => {
    const counter = order("counter", "awaiting_collection", {
      deadline: "2026-10-30T06:00:00Z",
    });
    expect(isSlaBreached(counter, NOW)).toBe(true);
    expect(buildNeedsActionQueue([counter], NOW).map((row) => row.action)).toEqual([
      "late",
    ]);
  });

  it("falls back to when the order entered its state, and puts an unknown wait last", () => {
    const rows = buildNeedsActionQueue(
      [
        order("unknown", "ready_for_dispatch", {
          updatedAt: undefined,
        } as Partial<Order>),
        order("timeline", "ready_for_dispatch", {
          timeline: [
            { at: "2026-10-29T00:00:00Z", state: "production", note: "" },
            { at: "2026-10-30T00:00:00Z", state: "ready_for_dispatch", note: "" },
          ],
          updatedAt: "2026-10-31T05:00:00Z",
        }),
      ],
      NOW,
    );
    expect(rows.map((row) => [row.order.id, row.since])).toEqual([
      ["timeline", "2026-10-30T00:00:00Z"],
      ["unknown", null],
    ]);
  });
});
