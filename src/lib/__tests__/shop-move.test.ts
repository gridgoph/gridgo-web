import { describe, expect, it } from "vitest";

import type { Order, ShopMove, ShopMovePricing } from "@/lib/api/types";
import { presentFailureKind, presentRecoveryStatus } from "@/lib/shop-changes";
import {
  SHOP_MOVE_CAUSES,
  canStartShopMove,
  coverCapLine,
  lateCauseAvailable,
  moveChoiceLine,
  moveRefundLine,
  presentMoveCause,
  priceFacts,
  priceRuleLine,
  shopMoveMoney,
} from "@/lib/shop-move";
import { shopRelease } from "@/lib/supplier-recovery";

const NOW = Date.parse("2026-11-02T02:00:00.000Z");
const order = (patch: Partial<Order> = {}) =>
  ({ state: "production", supplierId: "shop-a", ...patch }) as Order;

const pricing = (patch: Partial<ShopMovePricing>): ShopMovePricing => ({
  ruleApplies: true,
  rule: "same",
  originalPriceMinor: 10000,
  newPriceMinor: 10000,
  differenceMinor: 0,
  gridgoCoverMinor: 0,
  clientPaysMinor: 0,
  refundMinor: 0,
  ...patch,
});

describe("starting a move", () => {
  it("offers the three causes Operations may send, each with its help", () => {
    expect(SHOP_MOVE_CAUSES.map((c) => c.cause)).toEqual(["late", "gridgo", "client"]);
    expect(SHOP_MOVE_CAUSES.every((c) => c.help.length > 0)).toBe(true);
    expect(SHOP_MOVE_CAUSES.find((c) => c.cause === "client")?.help).toMatch(/No cover/);
  });

  it("only offers the move on an assigned order with no open recovery or hold", () => {
    expect(canStartShopMove(order())).toBe(true);
    expect(canStartShopMove(order({ supplierId: null }))).toBe(false);
    expect(canStartShopMove(order({ state: "delivered" }))).toBe(false);
    expect(canStartShopMove(order({ shopRecovery: { id: "r", status: "awaiting_client" } }))).toBe(false);
    expect(canStartShopMove(order({ shopRecovery: { id: "r", status: "awaiting_payment" } }))).toBe(false);
    expect(canStartShopMove(order({ shopRecovery: { id: "r", status: "accepted" } }))).toBe(true);
    expect(canStartShopMove(order({ refundHold: true }))).toBe(false);
    expect(
      canStartShopMove(order({ rescheduleRequest: { workHeld: true } as Order["rescheduleRequest"] })),
    ).toBe(false);
  });

  it("offers lateness only in production once the ready-by passed or reassignment is allowed", () => {
    expect(lateCauseAvailable(order({ readyBy: "2026-11-01T00:00:00.000Z" }), NOW)).toBe(true);
    expect(lateCauseAvailable(order({ readyBy: "2026-11-05T00:00:00.000Z" }), NOW)).toBe(false);
    expect(lateCauseAvailable(order({ readyBy: null, productionReassignmentEligible: true }), NOW)).toBe(true);
    expect(
      lateCauseAvailable(order({ state: "ready_for_dispatch", readyBy: "2026-11-01T00:00:00.000Z" }), NOW),
    ).toBe(false);
  });
});

describe("the price rule", () => {
  it("says what each rule does with the difference", () => {
    expect(priceRuleLine(pricing({ rule: "cheaper", newPriceMinor: 9000, differenceMinor: -1000, refundMinor: 1000 }))).toBe(
      "Cheaper by ₱10.00. The client gets ₱10.00 back.",
    );
    expect(priceRuleLine(pricing({}))).toBe("Same price. Nothing to settle.");
    expect(priceRuleLine(pricing({ rule: "covered", newPriceMinor: 10400, differenceMinor: 400, gridgoCoverMinor: 400 }))).toBe(
      "Dearer by ₱4.00. GRIDGO covers all of it from its fee.",
    );
    expect(
      priceRuleLine(pricing({ rule: "above_cap", newPriceMinor: 11000, differenceMinor: 1000, gridgoCoverMinor: 500, clientPaysMinor: 500 })),
    ).toBe("Dearer by ₱10.00. GRIDGO covers ₱5.00; the client pays ₱5.00, picks another shop, or takes a full refund.");
    expect(priceRuleLine(pricing({ ruleApplies: false, rule: "not_applicable" }))).toMatch(/^Client-caused: no cover/);
    // A move already made says what the client pays, not the choices it had.
    expect(
      priceRuleLine(
        pricing({ rule: "above_cap", newPriceMinor: 11000, differenceMinor: 1000, gridgoCoverMinor: 500, clientPaysMinor: 500 }),
        true,
      ),
    ).toBe("Dearer by ₱10.00. GRIDGO covers ₱5.00; the client pays the remaining ₱5.00.");
  });

  it("lists the figures, leaving out the zeros", () => {
    expect(priceFacts(pricing({}))).toEqual([
      { term: "Original price", value: "₱100.00" },
      { term: "New price", value: "₱100.00" },
    ]);
    expect(
      priceFacts(pricing({ rule: "above_cap", newPriceMinor: 11000, differenceMinor: 1000, gridgoCoverMinor: 500, clientPaysMinor: 500 })).map(
        (f) => `${f.term} ${f.value}`,
      ),
    ).toEqual([
      "Original price ₱100.00",
      "New price ₱110.00",
      "Difference +₱10.00",
      "GRIDGO covers ₱5.00",
      "Client pays the rest ₱5.00",
    ]);
  });

  it("names GRIDGO's limit and when collection lowered it", () => {
    const capped = pricing({ capBps: 5000, serviceFeeMinor: 1000, capMinor: 300, capLimitedByCollection: true });
    expect(coverCapLine(capped)).toBe(
      "GRIDGO covers up to ₱3.00 (50% of the ₱10.00 service fee), lowered to the fee actually collected.",
    );
    expect(coverCapLine(pricing({ ruleApplies: false, capMinor: 300 }))).toBeNull();
    expect(coverCapLine(pricing({}))).toBeNull();
  });
});

describe("moves already made", () => {
  const move = (patch: Partial<ShopMove>): ShopMove => ({
    id: "m",
    recoveryId: "r",
    at: "2026-11-02T00:00:00.000Z",
    fault: "shop",
    choice: "replacement",
    status: "applied",
    ...patch,
  });

  it("says what the client chose", () => {
    expect(moveChoiceLine(move({}))).toBe("Took the offered shop");
    expect(moveChoiceLine(move({ choice: "alternative", paysDifference: true }))).toBe(
      "Picked another offered shop and pays the rest",
    );
  });

  it("says where the client's difference stands", () => {
    expect(moveRefundLine(move({}))).toBeNull();
    expect(moveRefundLine(move({ refundMinor: 1000, refundStatus: "reserved" }))).toBe(
      "₱10.00 goes back to the client through Refunds.",
    );
    expect(moveRefundLine(move({ refundMinor: 1000, refundStatus: "reconciliation_required" }))).toMatch(
      /could not be set aside as a refund\. Reconcile it by hand/,
    );
  });

  it("words every cause and the new recovery state", () => {
    expect(presentMoveCause("late")).toBe("The shop was late");
    expect(presentMoveCause("gridgo")).toBe("Moved by GRIDGO");
    expect(presentMoveCause("client")).toBe("The client asked");
    expect(presentMoveCause(undefined)).toBeNull();
    expect(presentFailureKind("gridgo")).toBe("Moved by GRIDGO");
    expect(presentRecoveryStatus({ status: "awaiting_payment" }).label).toBe(
      "Moved, waiting for the client's payment",
    );
  });
});

describe("the money panel", () => {
  it("is absent until the order moved, and reads the four fields when it did", () => {
    expect(shopMoveMoney({})).toBeNull();
    expect(
      shopMoveMoney({ platformRevenue: { grossServiceFeeMinor: 1000, organizationDiscountMinor: 0, netServiceFeeMinor: 1000 } }),
    ).toBeNull();
    expect(
      shopMoveMoney({
        supplierSettlement: { shopMovePriceAdjustmentMinor: -1000 },
        platformRevenue: {
          grossServiceFeeMinor: 1000,
          organizationDiscountMinor: 0,
          netServiceFeeMinor: 1000,
          shopMoveCoverMinor: 0,
          shopMoveClientRefundMinor: 1000,
          shopMoveClientTopUpMinor: 0,
        },
      }),
    ).toEqual({
      priceAdjustmentMinor: -1000,
      coverMinor: 0,
      clientRefundMinor: 1000,
      clientTopUpMinor: 0,
      netServiceFeeMinor: 1000,
    });
  });
});

describe("the shop's own view", () => {
  it("never tells a shop it cancelled a job GRIDGO or the client moved", () => {
    const gridgo = shopRelease({
      state: "production",
      shopAcceptance: { supplierId: "s", assignedAt: "", deadlineAt: "", workingMinutes: 60, status: "cancelled" },
      shopRecovery: { id: "r", status: "awaiting_client" },
    });
    expect(gridgo?.title).toBe("You cancelled this job");
    const moved = shopRelease({
      state: "production",
      shopAcceptance: {
        supplierId: "s",
        assignedAt: "",
        deadlineAt: "",
        workingMinutes: 60,
        status: "gridgo",
      },
      shopRecovery: { id: "r", status: "awaiting_client" },
    });
    expect(moved?.title).toBe("GRIDGO is moving this job");
    expect(moved?.chip.label).toBe("Moved by GRIDGO");
  });

  it("tells the replacement shop its job starts once the client pays", () => {
    const waiting = shopRelease({ state: "supplier_assigned", shopRecovery: { id: "r", status: "awaiting_payment" } });
    expect(waiting?.title).toBe("This job starts once the client pays");
    expect(waiting?.chip.tone).toBe("info");
  });
});
