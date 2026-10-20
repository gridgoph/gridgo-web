import { describe, expect, it } from "vitest";

import type { PayoutMilestone } from "@/lib/api/types";
import { presentOrderState } from "@/lib/order-state";
import {
  CLAIM_HOLD_PACKING_REASON,
  actionsForJob,
  needsSupplierAction,
  presentSupplierJobStatus,
  primaryAction,
  supplierWaitingOn,
} from "@/lib/supplier-actions";

function job(state: string, milestones: PayoutMilestone[] = [], payoutHold = false) {
  return { state, payoutMilestones: milestones, payoutHold };
}

function milestone(
  code: PayoutMilestone["code"],
  status: PayoutMilestone["status"],
): PayoutMilestone {
  return {
    code,
    sharePercent: 25,
    status,
    pofFileIds: status === "pending_pof" ? [] : ["file-1"],
  };
}

describe("presentOrderState", () => {
  it("maps supplier states to plain language without snake_case", () => {
    expect(presentOrderState("supplier_assigned").label).toBe(
      "Awaiting supplier decision",
    );
    expect(presentOrderState("payment_authorized").label).toBe("Downpayment confirmed");
    expect(presentOrderState("awaiting_downpayment").label).toBe("Awaiting downpayment");
    expect(presentOrderState("awaiting_initial_payment").label).toBe(
      "Awaiting downpayment",
    );
    expect(presentOrderState("downpayment_review").label).toBe(
      "Downpayment needs confirming",
    );
    expect(presentOrderState("ready_for_dispatch").label).toBe("Ready for dispatch");
    expect(presentOrderState("supplier_assigned").label).not.toMatch(/_/);
  });

  it("always pairs tone with icon", () => {
    const p = presentOrderState("production");
    expect(p.icon).toBeTruthy();
    expect(p.tone).toBeTruthy();
    expect(p.label.length).toBeGreaterThan(0);
  });
});

describe("actionsForJob", () => {
  it("offers accept and decline only for supplier_assigned", () => {
    const actions = actionsForJob(job("supplier_assigned"));
    expect(actions.map((a) => a.kind)).toEqual(["accept", "decline"]);
    expect(actions.filter((a) => a.primary)).toHaveLength(1);
    expect(primaryAction(job("supplier_assigned"))?.targetState).toBe(
      "payment_authorized",
    );
    expect(primaryAction(job("supplier_assigned"))?.label).toBe("Accept job");
    const decline = actions.find((a) => a.kind === "decline");
    expect(decline?.targetState).toBe("approved_for_matching");
    expect(actions.filter((a) => a.kind !== "accept" && a.kind !== "decline")).toEqual(
      [],
    );
  });

  it("sends no price when the shop accepts an assigned job", () => {
    const accept = primaryAction(job("supplier_assigned"));
    expect(accept).not.toHaveProperty("needsPrice");
    expect(accept?.targetState).toBe("payment_authorized");
  });

  it("leaves payment to the client and Operations", () => {
    // The supplier no longer asks for payment; the client is told the price
    // automatically on acceptance and Operations confirms the transfer.
    expect(actionsForJob(job("awaiting_downpayment"))).toEqual([]);
    expect(actionsForJob(job("downpayment_review"))).toEqual([]);
    expect(supplierWaitingOn("downpayment_review")).toMatch(/Operations/);
  });

  it("has no actions left in the retired supplier-proof loop", () => {
    for (const state of [
      "supplier_proof_review",
      "supplier_proof_changes_requested",
      "supplier_proof_approved",
      "awaiting_payment",
    ]) {
      expect(actionsForJob(job(state))).toEqual([]);
    }
  });

  it("offers start production only before there is anything to photograph", () => {
    const actions = actionsForJob(
      job("payment_authorized", [
        milestone("printing", "pending_pof"),
        milestone("packaging_qc", "pending_pof"),
      ]),
    );
    expect(actions.map((action) => action.label)).toEqual(["Start production"]);
    expect(actions.some((action) => action.kind === "add_proof")).toBe(false);
  });

  it("asks for printing proof first and still offers packaging", () => {
    const actions = actionsForJob(
      job("production", [
        milestone("printing", "pending_pof"),
        milestone("packaging_qc", "pending_pof"),
      ]),
    );
    expect(actions[0]).toEqual({
      kind: "add_proof",
      label: "Add printing proof",
      targetState: null,
      primary: true,
      milestoneCode: "printing",
      proofLabel: "Printing",
      proofNoun: "printing",
      proofHint:
        "Show the finished print on your floor — enough of it to recognise the job, with the colour and the trim readable.",
    });
    expect(actions[1]).toMatchObject({
      kind: "ready_for_pickup",
      label: "Package for pickup",
      primary: false,
    });
  });

  it("asks for packaging proof once printing evidence is filed", () => {
    const actions = actionsForJob(
      job("production", [
        milestone("printing", "pof_attached"),
        milestone("packaging_qc", "pending_pof"),
        milestone("delivered", "pending_pof"),
        milestone("retention", "pending_pof"),
      ]),
    );
    expect(actions.map((action) => action.kind)).toEqual(["add_proof", "ready_for_pickup"]);
    expect(actions[1]?.primary).toBe(false);
    expect(actions[0]?.label).toBe("Add packaging proof");
    expect(actions[0]?.milestoneCode).toBe("packaging_qc");
    expect(actions[0]?.targetState).toBeNull();
  });

  it("offers package for pickup only after both shop proofs are filed", () => {
    const filed = [
      milestone("printing", "pof_attached"),
      milestone("packaging_qc", "pof_attached"),
      milestone("delivered", "pending_pof"),
      milestone("retention", "pending_pof"),
    ];
    expect(actionsForJob(job("production", filed)).map((action) => action.label)).toEqual(
      ["Package for pickup"],
    );
    expect(primaryAction(job("production", filed))?.targetState).toBe(
      "ready_for_dispatch",
    );
    expect(primaryAction(job("supplier_self_qc", filed))?.label).toBe(
      "Package for pickup",
    );
  });

  it("never asks the shop to file delivery or retention evidence", () => {
    const actions = actionsForJob(
      job("delivered", [
        milestone("printing", "pof_attached"),
        milestone("packaging_qc", "pof_attached"),
        milestone("delivered", "pending_pof"),
        milestone("retention", "pending_pof"),
      ]),
    );
    expect(actions.filter((action) => action.kind === "add_proof")).toEqual([]);
  });

  it("returns no actions for terminal supplier states", () => {
    expect(actionsForJob(job("ready_for_dispatch"))).toEqual([]);
    expect(actionsForJob(job("completed"))).toEqual([]);
    expect(needsSupplierAction(job("ready_for_dispatch"))).toBe(false);
  });
});

describe("claim hold", () => {
  const filed = [
    milestone("production_started", "pof_attached"),
    milestone("delivered", "pending_pof"),
    milestone("window_closed", "pending_pof"),
  ];

  it("keeps Package for pickup on the page, disabled with the reason", () => {
    for (const state of ["production", "supplier_self_qc"]) {
      const [action] = actionsForJob(job(state, filed, true));
      expect(action?.label).toBe("Package for pickup");
      expect(action?.blockedReason).toBe(CLAIM_HOLD_PACKING_REASON);
    }
    expect(CLAIM_HOLD_PACKING_REASON).toMatch(/Operations must clear the claim/);
  });

  it("is not something the shop needs to do while Operations decides", () => {
    expect(needsSupplierAction(job("production", filed, true))).toBe(false);
    expect(needsSupplierAction(job("production", filed, false))).toBe(true);
    expect(
      actionsForJob(job("production", filed, false))[0]?.blockedReason,
    ).toBeUndefined();
  });
});

describe("a rider-packs job (shop handover version 2, ord_de22bfb54b9d)", () => {
  const released = [milestone("production_started", "released")];
  const FINISHED = {
    code: "production_finished_required",
    message: "Submit photos of the finished, unpacked products for GRIDGO review first.",
  };
  const REVIEW = {
    code: "production_review_required",
    message: "Wait for GRIDGO to approve the finished-product photos before calling a rider.",
  };
  const submission = {
    at: "2026-10-16T05:10:00Z",
    by: "shop1",
    supplierId: "shop1",
    photoFileIds: ["file_a", "file_b"],
  };

  function riderPacks(state: string, extra: Record<string, unknown> = {}) {
    return {
      ...job(state, released),
      supplierId: "shop1",
      handoverFlow: "rider_packs" as const,
      // The shop's progress photo is on the job, as on the reported order.
      productionProgress: {
        status: "photos_available" as const,
        photos: [{ fileId: "file_p", contentType: "image/jpeg", at: "2026-10-16T04:52:00Z" }],
      },
      packingProgress: { status: "waiting_for_photo" as const, photos: [] },
      ...extra,
    };
  }

  it("asks for the finished work, never a packing photo, and counts it as the shop's to-do", () => {
    const order = riderPacks("production", {
      shopHandover: {},
      transitionReadiness: {
        ready_for_dispatch: { allowed: false, missing: [FINISHED, REVIEW] },
      },
    });
    const actions = actionsForJob(order);
    expect(actions.map((a) => [a.kind, a.label, a.blockedReason])).toEqual([
      ["send_finished_photos", "Send finished work for review", undefined],
    ]);
    expect(needsSupplierAction(order)).toBe(true);
  });

  it("asks for new photos after a send-back", () => {
    const order = riderPacks("production", {
      shopHandover: {
        finished: null,
        review: null,
        attempts: [
          {
            finished: submission,
            review: {
              at: "2026-10-16T05:20:00Z",
              by: "ops1",
              decision: "rejected",
              note: "Page 12 is smudged",
            },
          },
        ],
      },
    });
    expect(primaryAction(order)?.label).toBe("Send new photos for review");
  });

  it("offers nothing while GRIDGO reviews, and says so", () => {
    const order = riderPacks("supplier_self_qc", {
      shopHandover: { finished: submission, review: null },
      transitionReadiness: { ready_for_dispatch: { allowed: false, missing: [REVIEW] } },
    });
    expect(actionsForJob(order)).toEqual([]);
    expect(needsSupplierAction(order)).toBe(false);
    expect(supplierWaitingOn(order.state, order)).toMatch(
      /GRIDGO is checking your photos of the finished, unpacked work/,
    );
  });

  it("offers Ready for rider pickup once approved, and holds it for a claim", () => {
    const approved = {
      shopHandover: {
        finished: submission,
        review: { at: "2026-10-16T05:30:00Z", by: "ops1", decision: "approved", note: "" },
      },
    };
    const order = riderPacks("supplier_self_qc", {
      ...approved,
      transitionReadiness: { ready_for_dispatch: { allowed: true, missing: [] } },
    });
    expect(actionsForJob(order).map((a) => [a.label, a.targetState, a.blockedReason])).toEqual([
      ["Ready for rider pickup", "ready_for_dispatch", undefined],
    ]);

    const held = riderPacks("supplier_self_qc", {
      ...approved,
      transitionReadiness: {
        ready_for_dispatch: {
          allowed: false,
          missing: [{ code: "claim_hold_active", message: "A claim holds payouts." }],
        },
      },
    });
    expect(primaryAction(held)?.blockedReason).toBe("A claim holds payouts.");
    expect(needsSupplierAction(held)).toBe(false);
  });

  it("tells the shop not to pack while it waits for the rider", () => {
    expect(
      supplierWaitingOn("ready_for_dispatch", { handoverFlow: "rider_packs" }),
    ).toMatch(/Do not pack yet/);
  });
});

describe("stopped work", () => {
  const filed = [
    milestone("printing", "pof_attached"),
    milestone("packaging_qc", "pof_attached"),
  ];
  const now = new Date("2026-10-05T06:30:00.000Z");
  const window = {
    supplierId: "shop1",
    assignedAt: "2026-10-05T06:00:00.000Z",
    deadlineAt: "2026-10-05T07:00:00.000Z",
    workingMinutes: 60,
    status: "pending" as const,
  };

  function producing(extra: Record<string, unknown> = {}) {
    return { ...job("production", filed), ...extra };
  }

  it.each([
    ["with a readiness list", { transitionReadiness: { ready_for_dispatch: { allowed: true, missing: [] } } }],
    ["without a readiness list", {}],
  ])("offers nothing on a refund, %s", (_label, extra) => {
    const paused = producing({ refundHold: true, ...extra });
    const settled = producing({ refundDisposition: "cancelled", ...extra });
    expect(actionsForJob(paused)).toEqual([]);
    expect(actionsForJob(settled)).toEqual([]);
    expect(needsSupplierAction(paused)).toBe(false);
    expect(presentSupplierJobStatus(paused).label).toBe("Paused for refund");
    expect(presentSupplierJobStatus(settled).label).toBe("Cancelled and settled");
  });

  it("offers nothing on a recovery, and an accepted replacement is this shop's job", () => {
    const released = producing({
      shopAcceptance: { ...window, status: "cancelled" as const },
      shopRecovery: { id: "e1", status: "ops_review" as const },
    });
    expect(actionsForJob(released)).toEqual([]);
    expect(needsSupplierAction(released)).toBe(false);
    expect(presentSupplierJobStatus(released).label).toBe("Cancelled by you");

    const replacement = {
      ...job("supplier_assigned"),
      shopAcceptance: { ...window, deadlineAt: "2099-01-01T00:00:00.000Z" },
      shopRecovery: { id: "e1", status: "accepted" as const },
    };
    expect(actionsForJob(replacement, now).map((action) => action.kind)).toEqual([
      "accept",
      "decline",
    ]);
  });

  it("offers nothing while a declined deadline holds the job, and says so over a failed counter check", () => {
    const held = producing({
      state: "rider_assigned",
      pickupChecklist: { status: "failed_escalated", checks: [], evidenceFileIds: [], failureNote: null, completedAt: null, completedBy: null, escalationId: null },
      rescheduleRequest: {
        id: "r1",
        orderId: "o1",
        reason: "Laminator",
        status: "declined" as const,
        requestedAt: "2026-10-05T06:00:00.000Z",
        expiresAt: "2026-10-06T06:00:00.000Z",
        answeredAt: "2026-10-05T08:00:00.000Z",
        resolution: "rematch_offered" as const,
        refundRequestId: null,
        workHeld: true,
        originalReadyBy: "2026-10-07T09:00:00.000Z",
        proposedReadyBy: "2026-10-09T09:00:00.000Z",
      },
    });
    expect(actionsForJob(held)).toEqual([]);
    expect(presentSupplierJobStatus(held).label).toBe("Paused");
    expect(presentSupplierJobStatus({ ...held, rescheduleRequest: undefined }).label).toBe(
      "Pickup blocked",
    );
  });

  it("offers nothing once the hour to answer has run out, and keeps the offer while it runs", () => {
    const offer = {
      ...job("supplier_assigned"),
      shopAcceptance: window,
    };
    expect(actionsForJob(offer, new Date("2026-10-05T06:30:00.000Z")).map((a) => a.kind)).toEqual([
      "accept",
      "decline",
    ]);
    expect(actionsForJob(offer, new Date("2026-10-05T07:00:01.000Z"))).toEqual([]);
    expect(needsSupplierAction(offer, new Date("2026-10-05T07:00:01.000Z"))).toBe(false);
    expect(
      presentSupplierJobStatus(offer, new Date("2026-10-05T07:00:01.000Z")).label,
    ).toBe("Not answered in time");
  });

  it("does not keep a declined offer reading as an assigned job", () => {
    const declined = {
      ...job("supplier_assigned"),
      shopAcceptance: { ...window, status: "declined" as const },
    };
    expect(actionsForJob(declined)).toEqual([]);
    expect(needsSupplierAction(declined)).toBe(false);
    expect(presentSupplierJobStatus(declined).label).toBe("Passed on");
  });

  it("keeps a missing progress photo in front of packaging, with the payout proof first", () => {
    const actions = actionsForJob({
      ...job("production", [milestone("printing", "pending_pof")]),
      productionProgress: { status: "waiting_for_photo", photos: [] },
    });
    expect(actions.map((action) => action.kind)).toEqual(["add_proof", "add_progress_photo"]);
    expect(actions.some((action) => action.kind === "ready_for_pickup")).toBe(false);
  });

  it("still shows Package for pickup disabled while only a claim hold is set", () => {
    const held = job("production", filed, true);
    expect(actionsForJob(held)[0]).toMatchObject({
      label: "Package for pickup",
      blockedReason: CLAIM_HOLD_PACKING_REASON,
    });
    expect(needsSupplierAction(held)).toBe(false);

    const owed = job(
      "production",
      [milestone("printing", "pending_pof"), milestone("packaging_qc", "pending_pof")],
      true,
    );
    expect(actionsForJob(owed).map((action) => action.label)).toEqual(["Package for pickup"]);
    expect(actionsForJob(owed)[0]?.blockedReason).toBe(CLAIM_HOLD_PACKING_REASON);
  });
});
