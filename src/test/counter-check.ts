/**
 * Counter-check fixtures: a passing check, a short count escalated to
 * Operations, and a check from before counts were kept. Shapes follow
 * "Rider pickup checklist and escalation" in gridgo-api
 * docs/OPERATIONAL_MODEL_V2_API.md.
 */

import type { Escalation, Order, PickupCheck } from "@/lib/api/types";

export const CHECKED_AT = "2026-09-27T06:14:00.000Z";
export const SIGNED_AT = "2026-09-27T06:16:00.000Z";
export const EARLIER_AT = "2026-09-27T05:02:00.000Z";
export const RESOLVED_AT = "2026-09-27T05:20:00.000Z";

export function sixChecks(failed: string[] = []): PickupCheck[] {
  return [
    "quantity_match",
    "specification_match",
    "visible_defects",
    "packaging_integrity",
    "documentation",
    "supplier_sign_off",
  ].map((code) => ({ code, passed: !failed.includes(code) }));
}

const ITEMS = [
  {
    lineItemId: "cline_cards",
    itemName: "Business cards, matte 350gsm",
    expectedQuantity: 200,
  },
  { lineItemId: "cline_flyers", itemName: "A5 flyers, gloss", expectedQuantity: 100 },
];

function base(partial: Partial<Order>): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: "rider1",
    state: "rider_assigned",
    title: "Café opening kit",
    quantity: 2,
    deadline: null,
    address: "Unit 4, Roxas Ave, Davao City",
    totalMinor: 482_000,
    deliveryFeeMinor: 5_000,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    createdAt: EARLIER_AT,
    updatedAt: CHECKED_AT,
    timeline: [],
    pickupCountItems: ITEMS,
    ...partial,
  };
}

/** Everything counted right, all six passed, the shop signed. */
export function passedOrder(): Order {
  return base({
    state: "picked_up",
    pickupChecklist: {
      status: "passed",
      checks: sixChecks(),
      counts: [
        { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 200 },
        { lineItemId: "cline_flyers", expectedQuantity: 100, countedQuantity: 100 },
      ],
      evidenceFileIds: [],
      failureNote: null,
      completedAt: SIGNED_AT,
      completedBy: "rider1",
      escalationId: null,
      handoffSignature: {
        fileId: "file_signature",
        signerName: "Ana Reyes",
        signedAt: SIGNED_AT,
        riderId: "rider1",
        checklistHash: "0".repeat(64),
      },
    },
  });
}

/** The rider counted 12 cards short; the order is held at the shop. */
export function shortOrder(): Order {
  return base({
    pickupChecklist: {
      status: "failed_escalated",
      checks: sixChecks(["quantity_match"]),
      counts: [
        { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 188 },
        { lineItemId: "cline_flyers", expectedQuantity: 100, countedQuantity: 100 },
      ],
      evidenceFileIds: ["file_short_photo"],
      failureNote:
        "One bundle of cards is missing. The shop says it is still in the cutter.",
      completedAt: CHECKED_AT,
      completedBy: "rider1",
      escalationId: "esc_short",
      handoffSignature: null,
    },
  });
}

export function shortEscalation(status: "open" | "resolved" = "open"): Escalation {
  return {
    id: "esc_short",
    type: "pickup_check_failed",
    status,
    orderId: "order1",
    riderId: "rider1",
    supplierId: "shop1",
    failedCheckCodes: ["quantity_match"],
    checks: sixChecks(["quantity_match"]),
    counts: [
      { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 188 },
      { lineItemId: "cline_flyers", expectedQuantity: 100, countedQuantity: 100 },
    ],
    evidenceFileIds: ["file_short_photo"],
    failureNote:
      "One bundle of cards is missing. The shop says it is still in the cutter.",
    createdAt: CHECKED_AT,
    resolvedAt: status === "resolved" ? RESOLVED_AT : null,
    resolvedBy: status === "resolved" ? "ops1" : null,
    resolution:
      status === "resolved" ? "Wait for the last bundle, then count again." : null,
  };
}

/** A failed earlier attempt on the passing order: the flyers were scuffed. */
export function earlierEscalation(): Escalation {
  return {
    id: "esc_earlier",
    type: "pickup_check_failed",
    status: "resolved",
    orderId: "order1",
    riderId: "rider1",
    supplierId: "shop1",
    failedCheckCodes: ["visible_defects"],
    checks: sixChecks(["visible_defects"]),
    counts: [
      { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 200 },
      { lineItemId: "cline_flyers", expectedQuantity: 100, countedQuantity: 100 },
    ],
    evidenceFileIds: ["file_scuff_photo"],
    failureNote: "Top ten flyers are scuffed along the edge.",
    createdAt: EARLIER_AT,
    resolvedAt: RESOLVED_AT,
    resolvedBy: "ops1",
    resolution: "Shop is reprinting the top ten flyers. Wait, then check again.",
  };
}

/** Delivered before riders counted each line: no counts, no signature field. */
export function legacyOrder(): Order {
  return base({
    state: "delivered",
    pickupCountItems: [
      { lineItemId: null, itemName: "Tarpaulin banner, 3×6 ft", expectedQuantity: 2 },
    ],
    pickupChecklist: {
      status: "passed",
      checks: sixChecks(),
      evidenceFileIds: [],
      failureNote: null,
      completedAt: "2026-09-10T02:00:00.000Z",
      completedBy: "rider1",
      escalationId: null,
    },
  });
}

export const PEOPLE: Record<string, string> = {
  rider1: "Jomar Castillo",
  ops1: "Lia Operations",
};
