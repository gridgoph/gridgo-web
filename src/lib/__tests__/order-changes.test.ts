import { describe, expect, it } from "vitest";

import type { Order, OrderChangeRequest } from "@/lib/api/types";
import {
  acknowledgementFor,
  canRequestChange,
  changeExtrasOnStage,
  changePaymentAwaitingStaff,
  currentChangeRequest,
  declineReasonText,
  hasSpecialInstructions,
  instructionsReadAt,
  instructionsRowSummary,
  itemInstructions,
  parseExtra,
  presentChangeForStaff,
  proposedChangeError,
  shopChangeNotice,
} from "@/lib/order-changes";

const NOTE = "Please keep a 5 mm white border and print the logo in a slightly darker black.";

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "c1",
    supplierId: "shop_1",
    riderId: null,
    state: "production",
    title: "Flyers",
    deadline: null,
    address: "",
    deliveryFeeMinor: 0,
    totalMinor: 66900,
    timeline: [],
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
    productionItems: [
      { id: "line_1", itemName: "Flyers", quantity: 1, measurement: null, specialInstructions: NOTE },
      { id: "line_2", itemName: "Cards", quantity: 1, measurement: null, specialInstructions: "" },
    ],
    ...partial,
  } as Order;
}

function change(partial: Partial<OrderChangeRequest> = {}): OrderChangeRequest {
  return {
    id: "change_1",
    lineItemId: "line_1",
    status: "pending",
    version: 1,
    reason: "Needs a second pass.",
    proposedSpec: "Staple twice on the left edge.",
    extraPrincipalMinor: 15000,
    createdAt: "2026-10-15T11:41:57.538Z",
    ...partial,
  };
}

describe("notes", () => {
  it("reads each item's note in item order and skips items without one", () => {
    expect(itemInstructions(order())).toEqual([
      { lineItemId: "line_1", itemName: "Flyers", text: NOTE, agreedChange: null, agreedAt: null },
    ]);
    expect(hasSpecialInstructions(order())).toBe(true);
  });

  it("falls back to specialInstructionLines and to an older order's single note", () => {
    const fromLines = order({
      productionItems: [{ id: "line_1", itemName: "Flyers", quantity: 1, measurement: null }],
      specialInstructionLines: [{ lineItemId: "line_1", text: "Fold in half" }],
    });
    expect(itemInstructions(fromLines)[0].text).toBe("Fold in half");

    const legacy = order({ productionItems: [], specialInstructions: "Rush it" });
    expect(itemInstructions(legacy)).toEqual([
      { lineItemId: "", itemName: "Flyers", text: "Rush it", agreedChange: null, agreedAt: null },
    ]);
    expect(hasSpecialInstructions(order({ productionItems: [] }))).toBe(false);
  });

  it("carries the agreed change under its item", () => {
    const applied = order({
      productionItems: [
        {
          id: "line_1",
          itemName: "Flyers",
          quantity: 1,
          measurement: null,
          specialInstructions: NOTE,
          agreedChange: { id: "change_1", proposedSpec: "Staple twice", appliedAt: "2026-10-16T00:00:00.000Z" },
        },
      ],
    });
    expect(itemInstructions(applied)[0]).toMatchObject({
      agreedChange: "Staple twice",
      agreedAt: "2026-10-16T00:00:00.000Z",
    });
  });

  it("counts only this shop's tick, and none on an offer", () => {
    const ack = { supplierId: "shop_1", at: "2026-10-15T11:41:54.928Z" };
    expect(instructionsReadAt(order({ specialInstructionsAcknowledgement: ack }))).toBe(ack.at);
    expect(
      instructionsReadAt(order({ supplierId: "shop_2", specialInstructionsAcknowledgement: ack })),
    ).toBeNull();
    expect(
      instructionsReadAt(order({ state: "supplier_assigned", specialInstructionsAcknowledgement: ack })),
    ).toBeNull();
    expect(acknowledgementFor(order({ supplierId: "shop_2", specialInstructionsAcknowledgement: ack })))
      .toEqual({ at: ack.at, supplierId: "shop_1", currentShop: false });
  });
});

describe("when a change may be asked for", () => {
  it("is open from the offer until the job is first marked ready", () => {
    expect(canRequestChange(order({ state: "supplier_assigned" }))).toBe(true);
    expect(canRequestChange(order({ state: "production" }))).toBe(true);
    expect(canRequestChange(order({ state: "ready_for_dispatch" }))).toBe(false);
    // Returning to production does not reopen a recorded readiness window.
    expect(
      canRequestChange(
        order({ timeline: [{ at: "2026-10-15T00:00:00Z", state: "ready_for_dispatch", note: "" }] }),
      ),
    ).toBe(false);
  });

  it("allows one at a time, never beside a deadline request, a recovery or a refund", () => {
    expect(canRequestChange(order({ changeRequests: [change()] }))).toBe(false);
    expect(canRequestChange(order({ changeRequests: [change({ status: "declined" })] }))).toBe(true);
    expect(
      canRequestChange(order({ rescheduleRequest: { status: "pending" } as Order["rescheduleRequest"] })),
    ).toBe(false);
    expect(canRequestChange(order({ refundHold: true } as Partial<Order>))).toBe(false);
  });

  it("checks the form like GRIDGO does", () => {
    expect(proposedChangeError("  ")).toBe("Say what you will do differently.");
    expect(proposedChangeError("x".repeat(301))).toBe("Keep the change under 300 characters.");
    expect(proposedChangeError("x".repeat(300))).toBeNull();
    expect(parseExtra("")).toEqual({ ok: true, minor: 0 });
    expect(parseExtra("₱1,500.5")).toEqual({ ok: true, minor: 150050 });
    expect(parseExtra("-5").ok).toBe(false);
    expect(parseExtra("1.234").ok).toBe(false);
  });
});

describe("where a request stands", () => {
  it("is the open request when there is one, else the latest", () => {
    const rows = [change({ id: "a", status: "declined" }), change({ id: "b", status: "pending_payment" })];
    expect(currentChangeRequest(order({ changeRequests: rows }))?.id).toBe("b");
    const done = [change({ id: "a", status: "declined" }), change({ id: "b", status: "applied" })];
    expect(currentChangeRequest(order({ changeRequests: done }))?.id).toBe("b");
    expect(currentChangeRequest(order())).toBeNull();
  });

  it("says each state in the shop's words, with only the shop's own extra", () => {
    expect(shopChangeNotice(change()).chip.label).toBe("Waiting for the client");
    expect(shopChangeNotice(change({ status: "pending_payment" })).chip.label).toBe(
      "Approved, waiting for payment",
    );
    expect(shopChangeNotice(change({ status: "pending_confirmation" })).chip.label).toBe(
      "Payment being checked",
    );
    const applied = shopChangeNotice(
      change({ status: "applied", payout: { status: "pending", amountMinor: 15000 } }),
    );
    expect(applied.chip.label).toBe("Approved");
    expect(applied.money).toBe("₱150.00 extra for your shop, paid with your last payout part.");
    expect(shopChangeNotice(change({ status: "declined" })).money).toBe(
      "₱150.00 extra was not agreed. Nothing changes in what you are paid.",
    );
    expect(shopChangeNotice(change({ status: "closed" })).chip.label).toBe("Closed");
    expect(shopChangeNotice(change({ extraPrincipalMinor: 0 })).money).toBeNull();
  });

  it("puts only a submitted transfer on the GRIDGO Team", () => {
    expect(presentChangeForStaff(change({ status: "pending_confirmation" })).label).toBe(
      "Payment to check",
    );
    expect(changePaymentAwaitingStaff(order({ changeRequests: [change()] }))).toBe(false);
    expect(
      changePaymentAwaitingStaff(order({ changeRequests: [change({ status: "pending_confirmation" })] })),
    ).toBe(true);
    expect(
      instructionsRowSummary(
        order({
          specialInstructionsAcknowledgement: { supplierId: "shop_1", at: "2026-10-15T00:00:00Z" },
          changeRequests: [change({ status: "pending_confirmation" })],
        }),
      ),
    ).toBe("1 note, ticked by the shop, change request: payment to check");
  });
});

describe("the shop's extra on the final share", () => {
  const paid = change({ status: "applied", payout: { status: "pending", amountMinor: 15000 } });

  it("rides on the plan's final stage only", () => {
    const escrow = order({ payoutPlanVersion: 2, changeRequests: [paid] });
    expect(changeExtrasOnStage(escrow, { code: "issue_window" })).toBe(15000);
    expect(changeExtrasOnStage(escrow, { code: "delivered" })).toBe(0);
    const legacy = order({ payoutPlanVersion: 1, changeRequests: [paid] });
    expect(changeExtrasOnStage(legacy, { code: "retention" })).toBe(15000);
  });

  it("drops once released or superseded", () => {
    const released = change({ status: "applied", payout: { status: "released", amountMinor: 15000 } });
    expect(
      changeExtrasOnStage(order({ payoutPlanVersion: 2, changeRequests: [released] }), {
        code: "issue_window",
      }),
    ).toBe(0);
  });
});

describe("declining", () => {
  it("records GRIDGO's own wording for notes that are not possible", () => {
    expect(declineReasonText("special_instructions", "")).toBe("Special instructions not possible");
    expect(declineReasonText("special_instructions", " We have no foil. ")).toBe(
      "Special instructions not possible. We have no foil.",
    );
  });
});
