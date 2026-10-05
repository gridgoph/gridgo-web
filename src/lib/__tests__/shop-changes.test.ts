import { describe, expect, it } from "vitest";

import type { RescheduleRequest, ShopFailureEvent, ShopRecovery } from "@/lib/api/types";
import {
  acceptanceView,
  buildNeedsOperations,
  canResolveReschedule,
  failuresForOrder,
  presentFailureKind,
  presentRecoveryStatus,
  presentRescheduleStatus,
  rescheduleNeedsOperations,
  rescheduleOperationsReason,
} from "@/lib/shop-changes";

const when = (iso: string) => iso;

function recovery(id: string, status: ShopRecovery["status"]): ShopRecovery {
  return { id, status, originalSupplierId: "shop-a", stage: "production", createdAt: "2026-10-05T08:00:00.000Z", proposal: null };
}

function event(id: string, orderId: string, rec: ShopRecovery | null, at = "2026-10-05T08:00:00.000Z"): ShopFailureEvent {
  return { id, orderId, supplierId: "shop-a", kind: "cancelled", stage: "production", reason: "Press down", at, actorId: "shop-a", recovery: rec };
}

function request(patch: Partial<RescheduleRequest>): RescheduleRequest {
  return {
    id: "resched_1",
    orderId: "o-r",
    supplierId: "shop-b",
    reason: "Equipment repair",
    status: "pending",
    requestedAt: "2026-10-05T07:00:00.000Z",
    expiresAt: "2026-10-06T07:00:00.000Z",
    answeredAt: null,
    resolution: null,
    refundRequestId: null,
    workHeld: false,
    ...patch,
  };
}

describe("needs Operations", () => {
  it("lists one row per order in ops_review and each held deadline request, oldest first", () => {
    const review = recovery("ev-1", "ops_review");
    const items = buildNeedsOperations(
      [
        event("ev-0", "o-1", review, "2026-10-05T06:00:00.000Z"),
        event("ev-1", "o-1", review),
        event("ev-2", "o-2", recovery("ev-2", "awaiting_client")),
      ],
      [
        request({ id: "r-held", status: "declined", resolution: "operations_required", workHeld: true, answeredAt: "2026-10-05T07:30:00.000Z" }),
        request({ id: "r-applied", status: "operations_required", resolution: "operations_required", workHeld: true, answeredAt: "2026-10-05T09:00:00.000Z" }),
        request({ id: "r-done", status: "declined", resolution: "resolved", workHeld: false }),
        request({ id: "r-pending" }),
      ],
    );
    expect(items.map((item) => item.key)).toEqual([
      "reschedule:r-held",
      "recovery:ev-1",
      "reschedule:r-applied",
    ]);
    const first = items.find((item) => item.kind === "recovery");
    expect(first?.kind === "recovery" && first.event.id).toBe("ev-1");
  });

  it("only offers a resolution while the request holds work and no refund is in train", () => {
    expect(rescheduleNeedsOperations(request({ workHeld: true, resolution: "operations_required" }))).toBe(true);
    expect(rescheduleNeedsOperations(request({ workHeld: false, resolution: "operations_required" }))).toBe(false);
    expect(canResolveReschedule(request({ workHeld: true, resolution: "no_match" }))).toBe(true);
    expect(canResolveReschedule(request({ workHeld: true, resolution: "refund_requested" }))).toBe(false);
  });

  it("explains why the case is Operations'", () => {
    expect(
      rescheduleOperationsReason({ status: "operations_required", appliedDeductionMinor: 50000 }, (m) => `P${m / 100}`),
    ).toBe("A late-production deduction of P500 was already taken, so the new date was not applied. Dates and deductions are unchanged.");
    expect(rescheduleOperationsReason({ status: "declined", appliedDeductionMinor: 0 }, String)).toMatch(
      /^A shop payout was already released, so the client's decline/,
    );
  });
});

describe("words", () => {
  it("names every failure kind and status in plain language", () => {
    expect(presentFailureKind("timed_out")).toBe("No answer in time");
    expect(presentFailureKind("declined")).toBe("Declined the order");
    expect(presentFailureKind("cancelled")).toBe("Cancelled after accepting");
    expect(presentRecoveryStatus(recovery("x", "ops_review")).label).toBe("Needs Operations");
    expect(presentRecoveryStatus({ status: "awaiting_client", proposal: null }).label).toBe(
      "No replacement, client may refund",
    );
    expect(presentRescheduleStatus(request({ resolution: "rematched", status: "declined" })).label).toBe(
      "Moved to another shop",
    );
    expect(presentRescheduleStatus(request({ status: "expired" })).label).toBe(
      "No answer, original date stands",
    );
  });

  it("reads the acceptance window against the deadline, not wall-clock minutes", () => {
    const acceptance = {
      supplierId: "shop-a",
      assignedAt: "2026-10-05T09:30:00.000Z",
      deadlineAt: "2026-10-06T00:30:00.000Z",
      workingMinutes: 60,
      status: "pending" as const,
    };
    expect(acceptanceView(acceptance, when, Date.parse("2026-10-05T12:00:00.000Z"))).toEqual({
      summary: "Waiting for the shop to accept, until 2026-10-06T00:30:00.000Z.",
      open: true,
    });
    expect(acceptanceView({ ...acceptance, status: "timed_out" }, when).summary).toBe(
      "No answer by 2026-10-06T00:30:00.000Z.",
    );
  });

  it("orders one order's failures oldest first", () => {
    expect(
      failuresForOrder(
        [event("b", "o", null, "2026-10-05T09:00:00Z"), event("a", "o", null, "2026-10-05T08:00:00Z"), event("c", "x", null)],
        "o",
      ).map((e) => e.id),
    ).toEqual(["a", "b"]);
  });
});
