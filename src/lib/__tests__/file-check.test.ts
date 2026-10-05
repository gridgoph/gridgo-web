import { describe, expect, it } from "vitest";

import type { Order } from "@/lib/api/types";
import {
  FILE_CHECK_LONG_WAIT_SECONDS,
  FILE_CHECK_OVERDUE_SECONDS,
  buildFileCheckQueue,
  canDecideFileCheck,
  fileCheckWaitLine,
  fileCheckWaitSeconds,
  formatWait,
  qaChecksFor,
  sendBackReasonProblem,
  waitLevel,
} from "@/lib/file-check";

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
    expect(checks[0].label).toMatch(/Design link opens without signing in/);
    expect(checks[3].label).toMatch(/GRIDGO counter/);
  });
});
