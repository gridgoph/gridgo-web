import { describe, expect, it } from "vitest";

import type { Claim, Issue, Order } from "@/lib/api/types";

import { filterDispatchOrders, presentLocation, LOCATION_STALE_MS } from "../dispatch";
import {
  buildOverviewBuckets,
  isSlaAtRisk,
  isSlaBreached,
  pickOverviewNextAction,
} from "../overview";
import {
  presentMatchReason,
  presentClaimStatus,
  presentAuditAction,
  presentZone,
} from "../present";
import { buildRecoveryItems } from "../recovery";
import { buildScheduleEvents, filterEventsInRange, rangeForView } from "../schedule";

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
    deliveryFeeMinor: 15000,
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

describe("present helpers", () => {
  it("maps zones and claim status without snake_case", () => {
    expect(presentZone("davao_central")).toBe("Davao Central");
    expect(presentZone(null)).toBe("—");
    expect(presentZone(undefined)).toBe("—");
    expect(presentZone("")).toBe("—");
    expect(presentClaimStatus("payout_held").label).toBe("Payout held");
    expect(presentAuditAction("claim.raise")).toBe("Claim raised");
  });

  it("explains matching reason codes in plain language", () => {
    expect(presentMatchReason("svc_demo:product_family_mismatch")).toBe(
      "Product family does not match this order",
    );
    expect(presentMatchReason("qty_below_min")).toBe(
      "Quantity is below the service minimum",
    );
  });
});

describe("overview", () => {
  const now = Date.parse("2026-08-08T12:00:00.000Z");

  it("buckets QA, matching, delivery, and SLA risk", () => {
    const orders = [
      order({ id: "1", state: "needs_qa" }),
      order({ id: "2", state: "approved_for_matching" }),
      order({ id: "3", state: "production" }),
      order({
        id: "4",
        state: "rider_assigned",
        promisedDate: "2026-08-08T10:00:00.000Z",
      }),
      order({ id: "5", state: "draft" }),
    ];
    const buckets = buildOverviewBuckets(orders, [], [], now);
    const byId = Object.fromEntries(buckets.map((b) => [b.id, b.count]));
    expect(byId.needs_qa).toBe(1);
    expect(byId.awaiting_matching).toBe(1);
    expect(byId.in_production).toBe(1);
    expect(byId.out_for_delivery).toBe(1);
    expect(byId.sla_risk).toBe(1);
  });

  it("picks QA as the first next action", () => {
    const next = pickOverviewNextAction(
      [
        order({ id: "m", state: "approved_for_matching" }),
        order({ id: "q", state: "submitted", title: "QA first" }),
      ],
      [],
      [],
      now,
    );
    expect(next?.orderId).toBe("q");
    expect(next?.href).toContain("/ops/orders/q");
  });

  it("detects SLA near and breached", () => {
    expect(
      isSlaAtRisk(
        order({
          id: "a",
          state: "production",
          promisedDate: "2026-08-09T00:00:00.000Z",
        }),
        now,
      ),
    ).toBe(true);
    expect(
      isSlaBreached(
        order({
          id: "b",
          state: "production",
          promisedDate: "2026-08-07T00:00:00.000Z",
        }),
        now,
      ),
    ).toBe(true);
  });
});

describe("recovery", () => {
  it("includes open issues, holds, and client corrections with next actions", () => {
    const orders = [
      order({ id: "o1", state: "client_correction", title: "Fix me" }),
      order({ id: "o2", state: "issue_window_open", payoutHold: true }),
    ];
    const claims: Claim[] = [
      {
        id: "c1",
        orderId: "o2",
        raisedBy: "user_ops",
        reason: "colour wash",
        status: "payout_held",
        holdReason: "colour wash",
        releaseReason: null,
        heldAt: "2026-08-08T00:00:00.000Z",
        heldBy: "user_ops",
        releasedAt: null,
        releasedBy: null,
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
        issueId: null,
        timeline: [],
      },
    ];
    const issues: Issue[] = [
      {
        id: "i1",
        orderId: "o2",
        clientId: "user_client",
        description: "edges faded",
        kind: "material_quality",
        status: "open",
        consequence: "payout_hold",
        claimId: "c1",
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
      },
    ];
    const items = buildRecoveryItems(orders, claims, issues);
    expect(items.some((i) => i.kind === "client_correction")).toBe(true);
    expect(items.some((i) => i.kind === "open_issue")).toBe(true);
    expect(items.some((i) => i.kind === "payout_hold")).toBe(true);
    expect(items.every((i) => i.nextLabel && i.nextHref)).toBe(true);
  });
});

describe("dispatch location freshness", () => {
  const now = Date.parse("2026-08-08T12:00:00.000Z");

  it("never labels a stale ping as live", () => {
    const stale = presentLocation(
      {
        id: "p1",
        orderId: "o",
        riderId: "r",
        lat: 7.1,
        lng: 125.6,
        accuracy: 10,
        at: new Date(now - LOCATION_STALE_MS - 1000).toISOString(),
      },
      "out_for_delivery",
      now,
    );
    expect(stale.freshness).toBe("stale");
    expect(stale.label.toLowerCase()).not.toContain("live");
  });

  it("labels a recent ping as live", () => {
    const live = presentLocation(
      {
        id: "p2",
        orderId: "o",
        riderId: "r",
        lat: 7.1,
        lng: 125.6,
        accuracy: 10,
        at: new Date(now - 30_000).toISOString(),
      },
      "out_for_delivery",
      now,
    );
    expect(live.freshness).toBe("live");
  });

  it("filters dispatch orders and ranks ready first", () => {
    const list = filterDispatchOrders([
      order({ id: "a", state: "out_for_delivery" }),
      order({ id: "b", state: "ready_for_dispatch" }),
      order({ id: "c", state: "production" }),
    ]);
    expect(list.map((o) => o.id)).toEqual(["b", "a"]);
  });
});


describe("schedule", () => {
  it("builds events that link to authorised workspaces", () => {
    const events = buildScheduleEvents(
      [
        order({
          id: "q1",
          state: "needs_qa",
          title: "QA job",
          promisedDate: "2026-08-10T10:00:00.000Z",
        }),
        order({
          id: "d1",
          state: "ready_for_dispatch",
          title: "Pickup job",
          promisedDate: "2026-08-11T10:00:00.000Z",
        }),
      ],
      [],
    );
    expect(events.some((e) => e.kind === "qa" && e.href.includes("/ops/orders/"))).toBe(true);
    expect(
      events.some((e) => e.kind === "pickup" && e.href.includes("/ops/dispatch")),
    ).toBe(true);
  });

  it("treats a pending API initial payment as a confirmation event", () => {
    const events = buildScheduleEvents(
      [
        order({
          id: "pay1",
          state: "production",
          payments: {
            initial: {
              amountMinor: 8000,
              method: "qr_manual",
              status: "pending_confirmation",
              reference: "GCASH-1",
              submittedAt: "2026-08-31T10:00:00.000Z",
              confirmedAt: null,
              confirmedBy: null,
              confirmationSource: null,
            },
          } as Order["payments"],
        }),
      ],
      [],
    );
    const payment = events.find((e) => e.kind === "payment_confirmation");
    expect(payment?.href).toContain("/ops/orders/pay1");
    expect(payment?.detail?.toLowerCase()).toContain("downpayment");
  });

  it("filters events to the week range", () => {
    const anchor = new Date("2026-08-10T12:00:00.000Z");
    const { start, end } = rangeForView("week", anchor);
    const events = buildScheduleEvents([
      order({
        id: "in",
        state: "needs_qa",
        promisedDate: "2026-08-12T10:00:00.000Z",
      }),
      order({
        id: "out",
        state: "needs_qa",
        promisedDate: "2026-09-01T10:00:00.000Z",
      }),
    ]);
    const filtered = filterEventsInRange(events, start, end);
    expect(filtered.every((e) => e.orderId === "in")).toBe(true);
  });
});
