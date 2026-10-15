import { describe, expect, it } from "vitest";

import { stageNeedsOperations, waitingOnOperationsCount } from "@/app/ops/_lib/pipeline";
import type { DeliveryPin, DeliveryPinChange, Order, RefundRequest } from "@/lib/api/types";
import {
  deliveryCreditSnapshot,
  pinChangeAllowanceLine,
  pinConfirmationLine,
  pinCreditLine,
  pinDispatchBlocker,
  pinFeeDifferenceLine,
  pinMapPoints,
  pinReceiverLine,
  pinRowSummary,
  pinZoneLabel,
  presentPinConfirmation,
  presentPinForDispatch,
  signedPhp,
} from "@/lib/delivery-pin";
import {
  presentRefundState,
  refundHistoryLabel,
  refundInboxGroup,
  refundKindLabel,
  refundNeedsStaff,
  refundNextStep,
} from "@/lib/refunds";

const SHOP = { lat: 7.07, lng: 125.61, label: "Shop, Bajada" };
const ORIGINAL = { lat: 7.1, lng: 125.62, label: "Checkout pin, Lanang" };
const MOVED = { lat: 7.13, lng: 125.6, label: "Main entrance" };

function pin(patch: Partial<DeliveryPin> = {}): DeliveryPin {
  return {
    version: 1,
    status: "pending",
    requestedAt: "2026-10-15T06:00:00.000Z",
    confirmedAt: null,
    point: ORIGINAL,
    zone: "nearby",
    notes: "",
    receiverName: "",
    changeUsed: false,
    canConfirm: true,
    canChange: true,
    original: ORIGINAL,
    change: null,
    ...patch,
  };
}

function change(patch: Partial<DeliveryPinChange> = {}): DeliveryPinChange {
  return {
    id: "pin_1",
    status: "pending_payment",
    point: MOVED,
    zone: "away",
    distanceMeters: 7_400,
    deliveryFeeMinor: 11_000,
    feeDifferenceMinor: 6_000,
    createdAt: "2026-10-15T06:10:00.000Z",
    riderDifferenceMinor: 5_100,
    platformDifferenceMinor: 900,
    ...patch,
  };
}

function order(patch: Partial<Order> = {}): Order {
  return {
    id: "order_1",
    state: "ready_for_dispatch",
    riderId: null,
    pickup: SHOP,
    deliveryFeeMinor: 5_000,
    deliveryPin: pin(),
    ...patch,
  } as unknown as Order;
}

describe("the delivery pin's confirmation", () => {
  it("says the client confirmed, and when", () => {
    const confirmed = pin({ status: "confirmed", confirmedAt: "2026-10-15T07:20:00.000Z" });
    expect(presentPinConfirmation(confirmed).label).toBe("Client confirmed");
    expect(pinConfirmationLine(confirmed)).toMatch(/^Confirmed /);
  });

  it("keeps an unanswered pin as not confirmed, used as it is", () => {
    expect(presentPinConfirmation(pin()).label).toBe("Not confirmed yet");
    expect(pinConfirmationLine(pin())).toContain("the rider uses this pin as it is");
  });

  it("reads an empty receiver as the client", () => {
    expect(pinReceiverLine(pin())).toBe("The client");
    expect(pinReceiverLine(pin({ receiverName: " Alex " }))).toBe("Alex");
  });

  it("names the zone from the fixed delivery zones and never invents one", () => {
    expect(pinZoneLabel("long_distance")).toBe("Long Distance");
    expect(pinZoneLabel("out_of_zone")).toBe("Out of Zone");
    expect(pinZoneLabel("somewhere")).toBe("Zone not given");
  });
});

describe("the one pin change", () => {
  it("says an unused change is open until a rider is assigned", () => {
    expect(pinChangeAllowanceLine(order())).toContain("until a rider is assigned");
  });

  it("says an unused change closed once a rider was assigned", () => {
    const assigned = order({
      state: "rider_assigned",
      riderId: "rider_1",
      deliveryPin: pin({ canChange: false }),
    });
    expect(pinChangeAllowanceLine(assigned)).toBe("Not used, and closed: a rider was assigned.");
  });

  it("calls an unpaid proposal lapsed once the window closed on it", () => {
    const lapsed = order({ deliveryPin: pin({ canChange: false, change: change() }) });
    expect(pinChangeAllowanceLine(lapsed)).toContain("lapsed");
  });

  it("signs the difference from GRIDGO's side", () => {
    expect(pinFeeDifferenceLine(6_000)).toBe("₱60.00 more, paid by the client by QR");
    expect(pinFeeDifferenceLine(-4_000)).toBe("₱40.00 back to the client as a credit");
    expect(pinFeeDifferenceLine(0)).toBe("Same delivery fee");
    expect(signedPhp(6_000)).toBe("+₱60.00");
    expect(signedPhp(-4_000)).toBe("−₱40.00");
  });
});

describe("a dearer pin's payment", () => {
  const waiting = order({
    deliveryPin: pin({
      canChange: false,
      change: change({
        status: "pending_confirmation",
        payment: { proofFileId: "file_p", reference: "WALLET-123", submittedAt: "2026-10-15T06:20:00.000Z" },
      }),
    }),
  });

  it("holds dispatch and says why", () => {
    expect(pinDispatchBlocker(waiting)).toMatch(/Verify or reject the client's pin payment first/);
    expect(presentPinForDispatch(waiting)?.label).toBe("Payment to verify");
    expect(pinDispatchBlocker(order({ deliveryPin: pin({ change: change() }) }))).toBeNull();
  });

  it("is Operations' call in the Orders queue and on the rail", () => {
    expect(stageNeedsOperations(waiting)).toBe(true);
    expect(stageNeedsOperations(order({ deliveryPin: pin({ change: change() }) }))).toBe(false);
    expect(waitingOnOperationsCount([waiting, order()])).toBe(1);
  });

  it("leads the row's closed line", () => {
    expect(pinRowSummary(waiting)).toBe(
      "The client sent ₱60.00 for a new pin. Verify it before dispatch.",
    );
  });
});

describe("the pin map", () => {
  it("draws the shop and the pin in use before any change", () => {
    expect(pinMapPoints(order()).map((entry) => entry.kind)).toEqual(["shop", "final"]);
  });

  it("draws a proposal beside the pin still in use, never as the pin", () => {
    const points = pinMapPoints(order({ deliveryPin: pin({ change: change() }) }));
    expect(points.map((entry) => [entry.kind, entry.point.label])).toEqual([
      ["shop", SHOP.label],
      ["final", ORIGINAL.label],
      ["proposed", MOVED.label],
    ]);
  });

  it("draws the checkout pin as history once the change applied", () => {
    const applied = order({
      deliveryPin: pin({
        point: MOVED,
        changeUsed: true,
        change: change({ status: "applied", appliedAt: "2026-10-15T06:30:00.000Z" }),
      }),
    });
    expect(pinMapPoints(applied).map((entry) => [entry.kind, entry.point.label])).toEqual([
      ["shop", SHOP.label],
      ["original", ORIGINAL.label],
      ["final", MOVED.label],
    ]);
  });
});

describe("a cheaper pin's delivery-fee credit", () => {
  const credit: RefundRequest = {
    id: "refund_pin",
    orderId: "order_1",
    status: "destination_review",
    version: 1,
    policyVersion: "available_funds_v1",
    kind: "delivery_pin",
    reason: "Delivery pin changed to a lower delivery fee.",
    evidenceFileIds: [],
    destination: null,
    beforeProduction: false,
    late: false,
    filingDeadlineAt: null,
    createdAt: "2026-10-15T06:30:00.000Z",
    updatedAt: "2026-10-15T06:30:00.000Z",
    history: [{ kind: "delivery_credit_reserved", reason: "x", at: "2026-10-15T06:30:00.000Z" }],
    settlement: {
      id: "rsettle_1",
      principalMinor: 0,
      feeMinor: 0,
      deliveryMinor: 4_000,
      totalMinor: 4_000,
      disposition: "delivery_adjustment",
      reason: "Delivery pin changed to a lower delivery fee.",
      snapshot: { changeId: "pin_1", originalFeeMinor: 5_000, deliveryFeeMinor: 1_000 },
    } as unknown as RefundRequest["settlement"],
    payment: null,
  };
  const applied = change({
    status: "applied",
    deliveryFeeMinor: 1_000,
    feeDifferenceMinor: -4_000,
    refundRequestId: "refund_pin",
  });

  it("is named a credit and waits on the client's QR, not on staff", () => {
    expect(refundKindLabel("delivery_pin")).toBe("Delivery-fee credit");
    expect(presentRefundState(credit).label).toBe("Waiting on the client's QR");
    expect(refundInboxGroup(credit, "ops_admin")).toBe("client-qr");
    expect(refundNeedsStaff(credit, "ops_admin")).toBe(false);
    expect(refundNextStep(credit, { role: "ops_admin", userId: "ops_1" })).toContain(
      "Waiting on the client to add their own receiving QR",
    );
    expect(refundHistoryLabel({ kind: "delivery_credit_reserved" })).toContain(
      "Delivery-fee credit reserved",
    );
  });

  it("asks staff to verify once the client added a QR", () => {
    const withQr = {
      ...credit,
      destination: {
        provider: "gcash",
        accountName: "Client",
        qrFileId: "file_qr",
        revision: 1,
      },
    } as RefundRequest;
    expect(refundInboxGroup(withQr, "ops_admin")).toBe("review");
    expect(presentRefundState(withQr).label).toBe("Receiving QR to verify");
    expect(refundNextStep(withQr, { role: "ops_admin", userId: "ops_1" })).toContain(
      "Verify it, then reserve and send the exact amount",
    );
  });

  it("reads its frozen working, and nothing from another settlement", () => {
    expect(deliveryCreditSnapshot(credit.settlement)).toEqual({
      changeId: "pin_1",
      originalFeeMinor: 5_000,
      deliveryFeeMinor: 1_000,
    });
    expect(
      deliveryCreditSnapshot({ disposition: "cancelled", snapshot: undefined }),
    ).toBeNull();
  });

  it("says where the credit stands, from its own refund case", () => {
    expect(pinCreditLine(applied, [credit])).toBe(
      "₱40.00 credit. Waiting on the client's QR.",
    );
    expect(pinCreditLine(applied, null)).toContain("could not be loaded");
    const paid = {
      ...credit,
      status: "paid",
      payment: {
        id: "rpay",
        reference: "GC-77",
        receiptFileId: "file_r",
        amountMinor: 4_000,
        paidAt: "2026-10-16T02:00:00.000Z",
      },
    } as RefundRequest;
    expect(pinCreditLine(applied, [paid])).toMatch(/^₱40\.00 credit paid .*, reference GC-77\.$/);
  });
});
