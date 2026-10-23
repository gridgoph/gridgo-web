import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  pickupCallAvailability,
  pickupCallEntry,
  latestMissedCall,
  CALLS_NEED_BROWSER,
  type OrderCall,
} from "@/lib/order-call";
import {
  pickupChatEntry,
  pickupChatNotice,
  pickupChatOf,
  pickupChatUnavailable,
  pickupSendError,
} from "@/lib/pickup-chat";
import { approachReadout, approachWithdrawn, parseRiderApproach } from "@/lib/rider-approach";

const NOW = Date.parse("2026-10-16T04:00:00.000Z");

function call(patch: Partial<OrderCall>): OrderCall {
  return {
    id: "call_1",
    orderId: "ord_1",
    pair: "pickup",
    state: "missed",
    caller: { firstName: "Sam", role: "rider" },
    callee: { firstName: "Shop", role: "supplier" },
    mine: false,
    createdAt: "2026-10-16T03:50:00.000Z",
    ringExpiresAt: "2026-10-16T03:50:30.000Z",
    acceptedAt: null,
    endedAt: "2026-10-16T03:50:30.000Z",
    leaseExpiresAt: null,
    ...patch,
  };
}

describe("pickup chat", () => {
  it("reads an open window and keeps a closed one read-only", () => {
    const open = pickupChatOf({ pickupChat: { status: "open", riderFirstName: "Jun", unread: 2 } });
    expect(pickupChatEntry(open!).title).toBe("Message Jun");
    expect(pickupChatNotice(open!)).toMatch(/Only your shop and Jun/);
    const closed = pickupChatOf({
      pickupChat: { status: "read_only", riderFirstName: "Jun", closesAt: "2026-10-16T12:00:00.000Z" },
    });
    expect(closed?.status).toBe("read_only");
    expect(pickupChatNotice(closed!)).toMatch(/no new messages can be sent/);
    expect(pickupChatOf({ pickupChat: { status: "gone" } })).toBeNull();
  });

  it("says a removed conversation is gone, and a retryable failure is not", () => {
    expect(pickupChatUnavailable(new ApiError(410, { error: "pickup_chat_closed" }))?.title).toBe(
      "These messages were removed",
    );
    expect(pickupChatUnavailable(new ApiError(409, { error: "pickup_chat_not_available" }))?.title).toBe(
      "No rider to message yet",
    );
    expect(pickupChatUnavailable(new Error("offline"))).toBeNull();
    expect(pickupSendError(new ApiError(409, { error: "pickup_chat_read_only" }))).toMatch(/no new messages/);
  });
});

describe("rider approach", () => {
  const shop = { lat: 7.07, lng: 125.61 };
  const ping = { lat: 7.08, lng: 125.61, at: new Date(NOW - 20_000).toISOString() };

  it("says a fresh position is updated, and an old one was last seen", () => {
    const live = approachReadout({
      approach: parseRiderApproach({ ping, shop }),
      route: null,
      riderName: "Jun",
      now: NOW,
    });
    expect(live.kind).toBe("live");
    expect(live.freshness.label).toMatch(/^Updated /);
    const stale = approachReadout({
      approach: parseRiderApproach({ ping: { ...ping, at: new Date(NOW - 10 * 60_000).toISOString() }, shop }),
      route: null,
      riderName: "Jun",
      now: NOW,
    });
    expect(stale.kind).toBe("stale");
    expect(stale.headline).toMatch(/Jun was last seen/);
    expect(stale.detail).toMatch(/stopped sending a location/);
  });

  it("says when no location has arrived, and disappears once sharing is withdrawn", () => {
    const waiting = approachReadout({
      approach: parseRiderApproach({ ping: null, shop }),
      route: null,
      riderName: null,
      now: NOW,
    });
    expect(waiting.headline).toBe("The rider has not shared a location yet");
    expect(waiting.freshness.label).toBe("No location yet");
    const hidden = parseRiderApproach({ ping, shop, hidden: "picked_up" });
    expect(hidden.ping).toBeNull();
    expect(approachWithdrawn(hidden, false)).toBe(true);
    expect(approachWithdrawn(null, true)).toBe(true);
    expect(approachWithdrawn(parseRiderApproach({ ping, shop }), false)).toBe(false);
  });
});

describe("pickup calls", () => {
  it("offers a call only while the pickup conversation is open and the rider is on the way", () => {
    expect(
      pickupCallAvailability({
        state: "rider_assigned",
        pickupChat: { status: "open", riderFirstName: "Jun" },
      }),
    ).toEqual({ kind: "open", riderFirstName: "Jun" });
    expect(
      pickupCallAvailability({
        state: "picked_up",
        pickupChat: { status: "open", riderFirstName: "Jun" },
      }).kind,
    ).toBe("closed");
    expect(
      pickupCallAvailability({
        state: "rider_assigned",
        pickupChat: { status: "read_only", riderFirstName: "Jun" },
      }).kind,
    ).toBe("closed");
    expect(pickupCallAvailability({ state: "rider_assigned" }).kind).toBe("closed");
  });

  it("names a missed call and tells an unsupported browser to use messages", () => {
    expect(latestMissedCall([call({})])?.title).toBe("Missed call from Sam");
    expect(latestMissedCall([call({ mine: true, state: "missed" })])).toBeNull();
    expect(pickupCallEntry("Jun", false).detail).toBe(CALLS_NEED_BROWSER);
    expect(pickupCallEntry("Jun", true).detail).toMatch(/your number stays private/);
  });
});
