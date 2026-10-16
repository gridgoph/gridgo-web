import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";
import {
  FILE_CHECK_LONG_WAIT_SECONDS,
  FILE_CHECK_OVERDUE_SECONDS,
  buildFileCheckQueue,
  canDecideFileCheck,
  fileCheckReviewSlot,
  fileCheckWaitLine,
  fileCheckWaitSeconds,
  formatWait,
  qaChecksFor,
  sendBackReasonProblem,
  waitLevel,
} from "@/lib/file-check";
import { LAUNCH_OPERATING_HOURS } from "@/lib/operating-hours";

const NOW = Date.parse("2026-10-05T10:00:00.000Z");

function order(id: string, state: string, requestedAt: string | null, extra: Partial<Order> = {}): Order {
  return {
    id,
    state,
    title: `Order ${id}`,
    updatedAt: "2026-10-05T09:00:00.000Z",
    fileCheck: requestedAt
      ? { status: "pending", requestedAt, reviewedAt: null, reason: null, waitingSeconds: 0 }
      : undefined,
    ...extra,
  } as Order;
}

describe("file-check wait", () => {
  it("counts from requestedAt against the reader's clock", () => {
    expect(fileCheckWaitSeconds(order("a", "needs_qa", "2026-10-05T09:30:00.000Z"), NOW)).toBe(1800);
  });

  it("falls back to the API's waitingSeconds when requestedAt cannot be read", () => {
    const o = order("a", "needs_qa", "not a date");
    o.fileCheck!.waitingSeconds = 120;
    expect(fileCheckWaitSeconds(o, NOW)).toBe(120);
  });

  it("is null once the check is decided or absent", () => {
    const passed = order("a", "supplier_assigned", "2026-10-05T09:00:00.000Z");
    passed.fileCheck!.status = "passed";
    expect(fileCheckWaitSeconds(passed, NOW)).toBeNull();
    expect(fileCheckWaitSeconds(order("b", "needs_qa", null), NOW)).toBeNull();
  });

  it("marks long and overdue waits", () => {
    expect(waitLevel(FILE_CHECK_LONG_WAIT_SECONDS - 1)).toBe("fresh");
    expect(waitLevel(FILE_CHECK_LONG_WAIT_SECONDS)).toBe("long");
    expect(waitLevel(FILE_CHECK_OVERDUE_SECONDS)).toBe("overdue");
  });

  it("formats waits in plain units", () => {
    expect(formatWait(30)).toBe("Under a minute");
    expect(formatWait(12 * 60)).toBe("12 min");
    expect(formatWait(2 * 3600)).toBe("2 h");
    expect(formatWait(2 * 3600 + 5 * 60)).toBe("2 h 5 min");
    expect(formatWait(27 * 3600)).toBe("1 d 3 h");
  });
});

describe("buildFileCheckQueue", () => {
  it("lists paid files oldest first, payment-review files apart, and sent-back orders", () => {
    const queue = buildFileCheckQueue(
      [
        order("new", "needs_qa", "2026-10-05T09:55:00.000Z"),
        order("old", "needs_qa", "2026-10-05T06:00:00.000Z"),
        order("legacy", "needs_qa", null),
        order("unpaid", "initial_payment_review", "2026-10-05T08:00:00.000Z"),
        order("back", "client_correction", null),
        order("shop", "production", null),
      ],
      NOW,
    );
    expect(queue.ready.map((row) => row.order.id)).toEqual(["old", "new", "legacy"]);
    expect(queue.ready[0].waitSeconds).toBe(4 * 3600);
    expect(queue.ready[2].waitSeconds).toBeNull();
    expect(queue.awaitingPayment.map((row) => row.order.id)).toEqual(["unpaid"]);
    expect(queue.sentBack.map((o) => o.id)).toEqual(["back"]);
  });

  it("only offers Pass and Send back at needs_qa", () => {
    expect(canDecideFileCheck({ state: "needs_qa" })).toBe(true);
    expect(canDecideFileCheck({ state: "initial_payment_review" })).toBe(false);
  });

  it("says whose move the waiting file is", () => {
    expect(fileCheckWaitLine(order("a", "needs_qa", "2026-10-05T09:00:00.000Z"), NOW)).toBe(
      "File waiting 1 h. Pass it or send it back.",
    );
    expect(
      fileCheckWaitLine(order("a", "initial_payment_review", "2026-10-05T09:59:30.000Z"), NOW),
    ).toBe("File waiting under a minute, behind the payment check.");
  });
});

describe("send back", () => {
  it("needs a reason the client can read", () => {
    expect(sendBackReasonProblem("   ")).toMatch(/Say what the client needs to fix/);
    expect(sendBackReasonProblem("x".repeat(2001))).toMatch(/under 2,000/);
    expect(sendBackReasonProblem("The link asks for a sign-in.")).toBeNull();
  });
});

describe("qaChecksFor", () => {
  it("names a design link and a pick-up in the checks", () => {
    const checks = qaChecksFor({
      artworkFileIds: [],
      productionItems: [
        { id: "l1", artworkLinks: [{ url: "https://www.canva.com/design/x/view" }] },
      ] as Order["productionItems"],
      requestFulfillment: { fulfillmentMode: "pickup", dropoff: null },
    });
    expect(checks.map((c) => c.id)).toEqual(["artwork", "spec", "quantity", "address"]);
    // A design link keeps its own check: open it without signing in.
    expect(checks[0].label).toMatch(/Design link opens without signing in/);
    expect(checks[3].label).toMatch(/GRIDGO counter/);
  });
});

describe("operating hours", () => {
  // Saturday 10 Oct 2026, 4:30 PM Manila: half an hour before the launch week closes.
  const SATURDAY_LATE = "2026-10-10T08:30:00.000Z";
  const SUNDAY_10AM = Date.parse("2026-10-11T02:00:00.000Z");
  const MONDAY_8AM = Date.parse("2026-10-12T00:00:00.000Z");
  const MONDAY_9AM = Date.parse("2026-10-12T01:00:00.000Z");
  const review = {
    status: "waiting_for_review",
    label: "Waiting for review",
    timeZone: "Asia/Manila",
    isOpenNow: false,
    artworkReviewMinutes: 60,
    scheduledReviewAt: "2026-10-12T00:00:00.000Z",
    reviewCompletesAt: "2026-10-12T01:00:00.000Z",
    reviewDelayed: false,
    originallyScheduledReviewAt: null,
    outsideHoursNotice: "outside_operating_hours",
    readyBy: null,
  };
  const newOrder = (extra: Partial<Order["review"] & object> = {}) =>
    order("n", "needs_qa", SATURDAY_LATE, { review: { ...review, ...extra } });

  it("counts a new order's wait in open time only", () => {
    // 30 minutes on Saturday, nothing on Sunday, an hour on Monday.
    expect(fileCheckWaitSeconds(newOrder(), MONDAY_9AM, LAUNCH_OPERATING_HOURS)).toBe(5400);
    // An order from before operating hours keeps the wall clock.
    const legacy = order("l", "needs_qa", SATURDAY_LATE);
    expect(fileCheckWaitSeconds(legacy, MONDAY_9AM, LAUNCH_OPERATING_HOURS)).toBe(
      (MONDAY_9AM - Date.parse(SATURDAY_LATE)) / 1000,
    );
  });

  it("says when a waiting file is reviewed while GRIDGO is closed", () => {
    expect(fileCheckReviewSlot(newOrder(), SUNDAY_10AM, LAUNCH_OPERATING_HOURS)).toEqual({
      closed: true,
      scheduledAt: MONDAY_8AM,
      delayed: false,
    });
    expect(fileCheckReviewSlot(newOrder(), MONDAY_9AM, LAUNCH_OPERATING_HOURS)).toEqual({
      closed: false,
      scheduledAt: MONDAY_9AM,
      delayed: false,
    });
  });

  it("follows a closure from the hours and keeps the API's delay tag", () => {
    const mondayOff = {
      ...LAUNCH_OPERATING_HOURS,
      schedule: {
        ...LAUNCH_OPERATING_HOURS.schedule,
        closures: [{ startDay: "2026-10-12", endDay: "2026-10-12" }],
      },
    };
    expect(
      fileCheckReviewSlot(newOrder({ reviewDelayed: true }), SUNDAY_10AM, mondayOff),
    ).toEqual({
      closed: true,
      scheduledAt: Date.parse("2026-10-13T00:00:00.000Z"),
      delayed: true,
    });
  });

  it("uses the order's own projection when the hours could not be read", () => {
    expect(fileCheckReviewSlot(newOrder(), SUNDAY_10AM)).toEqual({
      closed: true,
      scheduledAt: MONDAY_8AM,
      delayed: false,
    });
    // Once the projected opening has passed, the file is no longer held.
    expect(fileCheckReviewSlot(newOrder(), MONDAY_9AM)?.closed).toBe(false);
  });

  it("has no slot for an order from before operating hours or a decided check", () => {
    expect(fileCheckReviewSlot(order("l", "needs_qa", SATURDAY_LATE), SUNDAY_10AM)).toBeNull();
    const passed = newOrder();
    passed.fileCheck!.status = "passed";
    expect(fileCheckReviewSlot(passed, SUNDAY_10AM, LAUNCH_OPERATING_HOURS)).toBeNull();
  });

  it("tells the workspace when the file is checked, and that it was delayed", () => {
    const when = (at: number) => new Date(at).toISOString();
    expect(fileCheckWaitLine(newOrder(), SUNDAY_10AM, when)).toBe(
      "Waiting for review: GRIDGO is closed, so the file is checked 2026-10-12T00:00:00.000Z.",
    );
    expect(
      fileCheckWaitLine(
        { ...newOrder({ reviewDelayed: true }), state: "payment_review" },
        SUNDAY_10AM,
        when,
      ),
    ).toBe(
      "Waiting for review 2026-10-12T00:00:00.000Z, behind the payment check. Review delayed.",
    );
  });
});
