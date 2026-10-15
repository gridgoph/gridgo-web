import { describe, expect, it } from "vitest";

import type { Order, ShopHandover } from "@/lib/api/types";
import { presentOrderState } from "@/lib/order-state";
import {
  approvedQueue,
  awaitingFinishedReview,
  checksAForceSkips,
  finishedReviewQueue,
  finishedReviewStatus,
  finishedReviewWaitingCount,
  forcedByGridgo,
  forcedReasonCodes,
  forcedReasonLabel,
  forcedSummary,
  handoverFlowOf,
  handoverSteps,
  handoverVisible,
  sentBackQueue,
  skippedCheckLabel,
  submissionNumber,
  submissionPhotos,
  submissionWaitSeconds,
} from "@/lib/shop-handover";

const when = (iso: string) => iso.slice(0, 10);

function order(extra: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    supplierId: "shop_1",
    riderId: null,
    state: "production",
    title: "Flyers",
    timeline: [],
    handoverFlow: "rider_packs",
    shopHandover: {},
    ...extra,
  } as unknown as Order;
}

const submitted = (
  at = "2026-10-15T02:00:00.000Z",
  photoFileIds = ["file_a", "file_b"],
) => ({
  at,
  by: "shop_1",
  supplierId: "shop_1",
  photoFileIds,
});

const rejected = (
  at: string,
  note = "Reprint the smudged copies",
): ShopHandover["attempts"] => [
  {
    finished: submitted("2026-10-14T02:00:00.000Z", ["file_old"]),
    review: { at, by: "ops_1", decision: "rejected", note },
  },
];

describe("the handover flow", () => {
  it("reads the flow only from the API's field", () => {
    expect(handoverFlowOf(order())).toBe("rider_packs");
    expect(handoverFlowOf(order({ handoverFlow: "legacy" }))).toBe("legacy");
    expect(handoverFlowOf(order({ handoverFlow: undefined }))).toBeNull();
    expect(handoverFlowOf(order({ handoverFlow: "shop_packs" as never }))).toBeNull();
  });

  it("shows the handover from production on, and never on an API that does not say", () => {
    expect(handoverVisible(order())).toBe(true);
    expect(handoverVisible(order({ state: "payment_authorized" }))).toBe(false);
    expect(handoverVisible(order({ handoverFlow: undefined }))).toBe(false);
  });
});

describe("the finished-work review", () => {
  it("is pending only for this shop's open submission in supplier_self_qc", () => {
    const pending = order({
      state: "supplier_self_qc",
      shopHandover: { finished: submitted(), review: null },
    });
    expect(finishedReviewStatus(pending)).toBe("pending");
    expect(awaitingFinishedReview(pending)).toBe(true);

    // A replacement shop never inherits another shop's submission.
    const otherShop = order({
      state: "supplier_self_qc",
      shopHandover: {
        finished: { ...submitted(), supplierId: "shop_old" },
        review: null,
      },
    });
    expect(awaitingFinishedReview(otherShop)).toBe(false);

    // The older flow has no review at all.
    expect(
      finishedReviewStatus(order({ handoverFlow: "legacy", state: "supplier_self_qc" })),
    ).toBeNull();
  });

  it("tells sent back, approved and not yet submitted apart", () => {
    expect(finishedReviewStatus(order())).toBe("not_submitted");
    expect(
      finishedReviewStatus(
        order({
          shopHandover: {
            finished: null,
            attempts: rejected("2026-10-14T05:00:00.000Z"),
          },
        }),
      ),
    ).toBe("sent_back");
    expect(
      finishedReviewStatus(
        order({
          state: "ready_for_dispatch",
          shopHandover: {
            finished: submitted(),
            review: {
              at: "2026-10-15T03:00:00.000Z",
              by: "ops_1",
              decision: "approved",
              note: "",
            },
          },
        }),
      ),
    ).toBe("approved");
    // Forced past production without a review.
    expect(finishedReviewStatus(order({ state: "ready_for_dispatch" }))).toBe("skipped");
  });

  it("orders the queues: waiting oldest first, sent back and approved latest first", () => {
    const a = order({
      id: "a",
      state: "supplier_self_qc",
      shopHandover: { finished: submitted("2026-10-15T05:00:00.000Z") },
    });
    const b = order({
      id: "b",
      state: "supplier_self_qc",
      shopHandover: { finished: submitted("2026-10-15T01:00:00.000Z") },
    });
    const back1 = order({
      id: "c",
      shopHandover: { finished: null, attempts: rejected("2026-10-14T05:00:00.000Z") },
    });
    const back2 = order({
      id: "d",
      shopHandover: { finished: null, attempts: rejected("2026-10-15T05:00:00.000Z") },
    });
    const ok = order({
      id: "e",
      state: "rider_assigned",
      shopHandover: {
        finished: submitted(),
        review: {
          at: "2026-10-15T03:00:00.000Z",
          by: "ops_1",
          decision: "approved",
          note: "",
        },
      },
    });
    const all = [
      a,
      b,
      back1,
      back2,
      ok,
      order({ id: "f", handoverFlow: "legacy", state: "supplier_self_qc" }),
    ];
    expect(finishedReviewQueue(all).map((o) => o.id)).toEqual(["b", "a"]);
    expect(sentBackQueue(all).map((o) => o.id)).toEqual(["d", "c"]);
    expect(approvedQueue(all).map((o) => o.id)).toEqual(["e"]);
    expect(finishedReviewWaitingCount(all)).toBe(2);
  });

  it("counts the try and the wait, and keeps an unsigned photo by id", () => {
    const resubmitted = order({
      state: "supplier_self_qc",
      shopHandover: {
        finished: submitted("2026-10-15T02:00:00.000Z", ["file_a", "file_b"]),
        attempts: rejected("2026-10-14T05:00:00.000Z"),
      },
      productionProgress: {
        status: "photos_available",
        photos: [
          {
            fileId: "file_a",
            contentType: "image/png",
            at: "2026-10-15T01:59:00.000Z",
            downloadUrl: "https://files.test/a.png",
          },
        ],
      },
    });
    expect(submissionNumber(resubmitted)).toBe(2);
    expect(
      submissionWaitSeconds(resubmitted, Date.parse("2026-10-15T02:45:00.000Z")),
    ).toBe(45 * 60);
    expect(submissionPhotos(resubmitted.shopHandover!.finished, resubmitted)).toEqual([
      {
        fileId: "file_a",
        contentType: "image/png",
        at: "2026-10-15T01:59:00.000Z",
        downloadUrl: "https://files.test/a.png",
      },
      { fileId: "file_b", contentType: "image/jpeg", at: "2026-10-15T02:00:00.000Z" },
    ]);
  });
});

describe("forced steps", () => {
  it("offers the API's reason codes, falling back to the known four", () => {
    expect(forcedReasonCodes(order({ forcedStepReasonCodes: ["other"] }))).toEqual([
      "other",
    ]);
    expect(forcedReasonCodes(order())).toEqual([
      "technical_issue",
      "evidence_verified_offline",
      "operational_correction",
      "other",
    ]);
    expect(forcedReasonLabel("evidence_verified_offline")).toBe(
      "Checked outside the app",
    );
    expect(forcedReasonLabel("brand_new_code")).toBe("Other reason");
  });

  it("names what a force would skip from the readiness snapshot, in words", () => {
    const skipped = checksAForceSkips(
      order({
        transitionReadiness: {
          ready_for_dispatch: {
            allowed: false,
            missing: [
              { code: "production_finished_required", message: "" },
              { code: "production_review_required", message: "" },
              { code: "claim_hold_active", message: "" },
            ],
          },
        },
      }),
    );
    // A hold cannot be forced past, so it is not a skipped check.
    expect(skipped).toEqual([
      "production_finished_required",
      "production_review_required",
    ]);
    expect(skippedCheckLabel("production_review_required")).toBe(
      "GRIDGO's review of the finished work",
    );
    expect(skippedCheckLabel("something_new")).not.toMatch(/_/);
  });

  it("reads Forced by GRIDGO from the tag or the record", () => {
    expect(forcedByGridgo(order({ forcedByGridgo: true }))).toBe(true);
    expect(forcedByGridgo(order())).toBe(false);
  });

  it("says what the latest force skipped, and that the rider's checks still happen", () => {
    const step = (skippedChecks: string[]) => ({
      at: "2026-10-15T04:00:00Z",
      by: "ops_1",
      role: "ops_admin",
      from: "supplier_self_qc",
      to: "ready_for_dispatch",
      reasonCode: "technical_issue",
      note: "Uploads failed",
      skippedChecks,
    });
    expect(
      forcedSummary(order({ forcedSteps: [step(["production_review_required"])] })),
    ).toBe(
      "Forced by GRIDGO, skipping GRIDGO's review of the finished work. The rider still checks the unpacked items and packs them in front of the shop.",
    );
    expect(
      forcedSummary(
        order({
          handoverFlow: "legacy",
          forcedSteps: [step(["production_photo_required", "packing_photo_required"])],
        }),
      ),
    ).toBe(
      "Forced by GRIDGO, skipping a progress photo from the shop and the shop's packing photo.",
    );
    expect(forcedSummary(order({ handoverFlow: "legacy", forcedByGridgo: true }))).toBe(
      "Forced by GRIDGO.",
    );
  });
});

describe("handover steps", () => {
  it("walks the rider-packs flow to the signature", () => {
    const steps = handoverSteps(
      order({
        state: "picked_up",
        readyAt: "2026-10-15T04:00:00.000Z",
        shopHandover: {
          finished: submitted(),
          review: {
            at: "2026-10-15T03:00:00.000Z",
            by: "ops_1",
            decision: "approved",
            note: "",
          },
          arrivedPacked: [
            {
              at: "2026-10-15T05:00:00.000Z",
              riderId: "r1",
              supplierId: "shop_1",
              assignedAt: null,
            },
          ],
          packingPhotos: [
            {
              at: "2026-10-15T05:20:00.000Z",
              by: "r1",
              fileId: "pack_1",
              inspectionId: "insp_1",
            },
          ],
        },
        pickupChecklist: {
          status: "passed",
          checks: [],
          evidenceFileIds: [],
          failureNote: null,
          completedAt: "2026-10-15T05:30:00.000Z",
          completedBy: "r1",
          escalationId: null,
          inspectionId: "insp_1",
          inspectedAt: "2026-10-15T05:10:00.000Z",
          packedPhotoFileIds: ["pack_1"],
          handoffSignature: {
            fileId: "sig",
            signerName: "Ana Reyes",
            signedAt: "2026-10-15T05:30:00.000Z",
            riderId: "r1",
          },
        },
      }),
      when,
    );
    expect(steps.map((step) => [step.id, step.status])).toEqual([
      ["finished_sent", "done"],
      ["gridgo_review", "done"],
      ["ready", "done"],
      ["unpacked_check", "done"],
      ["packed", "done"],
      ["signed", "done"],
    ]);
    expect(steps[3].detail).toMatch(/already packed/);
    expect(steps[5].detail).toBe("Signed by Ana Reyes.");
  });

  it("puts the review as the current step while it waits", () => {
    const steps = handoverSteps(
      order({ state: "supplier_self_qc", shopHandover: { finished: submitted() } }),
      when,
    );
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("current");
    expect(steps[1].detail).toMatch(/clock is paused/);
    expect(steps[2].status).toBe("upcoming");
  });

  it("marks steps a forced step went past, and only those", () => {
    const steps = handoverSteps(
      order({
        state: "ready_for_dispatch",
        forcedSteps: [
          {
            at: "2026-10-15T04:00:00.000Z",
            by: "ops_1",
            role: "ops_admin",
            from: "production",
            to: "ready_for_dispatch",
            reasonCode: "technical_issue",
            note: "Uploads failed",
            skippedChecks: ["production_finished_required", "production_review_required"],
          },
        ],
      }),
      when,
    );
    expect(steps.slice(0, 3).map((step) => step.status)).toEqual([
      "forced",
      "forced",
      "done",
    ]);
    expect(steps[3].status).toBe("upcoming");
  });

  it("walks the older flow with the shop's own packing", () => {
    const steps = handoverSteps(
      order({
        handoverFlow: "legacy",
        state: "rider_assigned",
        productionProgress: {
          status: "photos_available",
          photos: [
            { fileId: "p", contentType: "image/jpeg", at: "2026-10-15T01:00:00.000Z" },
          ],
        },
        packingProgress: {
          status: "photos_available",
          photos: [
            { fileId: "k", contentType: "image/jpeg", at: "2026-10-15T02:00:00.000Z" },
          ],
        },
      }),
      when,
    );
    expect(steps.map((step) => [step.id, step.status])).toEqual([
      ["progress_photo", "done"],
      ["shop_packed", "done"],
      ["ready", "done"],
      ["signed", "current"],
    ]);
  });
});

describe("the order's status chip in the rider-packs flow", () => {
  const label = (extra: Partial<Order>) => {
    const o = order({ state: "supplier_self_qc", ...extra });
    return presentOrderState(o.state, o).label;
  };

  it("says whose move it is, not just the state", () => {
    expect(label({ shopHandover: { finished: submitted(), review: null } })).toBe(
      "Finished work in review",
    );
    expect(
      label({
        shopHandover: {
          finished: submitted(),
          review: {
            at: "2026-10-15T03:00:00.000Z",
            by: "ops_1",
            decision: "approved",
            note: "",
          },
        },
      }),
    ).toBe("Approved, shop to call a rider");
    // Reached by a staff correction, with nothing submitted.
    expect(label({ shopHandover: {} })).toBe("No finished photos yet");
    expect(presentOrderState("ready_for_dispatch", order()).label).toBe(
      "Ready for rider pickup",
    );
  });
});
