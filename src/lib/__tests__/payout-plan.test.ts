import { describe, expect, it } from "vitest";

import { milestoneReleaseBlocker, PLATFORM_CONSTRAINT_COPY } from "@/lib/api/constraints";
import type { Order, PayoutMilestone } from "@/lib/api/types";
import {
  milestoneName,
  milestoneProofSource,
  presentMilestoneStatus,
} from "@/lib/order-state";
import {
  isLegacyPayoutPlan,
  isWindowStage,
  payoutPlanVersionOf,
  releaseRequirementOf,
  shopProofStages,
  stageNeedsProof,
  windowStageOf,
} from "@/lib/payout-plan";
import {
  milestoneProofs,
  milestoneReadiness,
  payoutQueueGroup,
  payoutSummary,
  readyWindowShare,
  releasableMilestones,
  sharesHeading,
} from "@/lib/payouts";
import {
  actionsForJob,
  nextShopProof,
  supplierWaitingOn,
} from "@/lib/supplier-actions";
import { escrowStages, legacyStages, proofOnFile, released } from "@/test/payout-plans";

function order(
  milestones: PayoutMilestone[],
  overrides: Partial<Order> = {},
): Order {
  return {
    id: "ord_escrow",
    clientId: "c1",
    supplierId: "s1",
    riderId: "r1",
    state: "production",
    title: "Tarpaulin",
    deadline: null,
    address: "Davao",
    deliveryFeeMinor: 0,
    totalMinor: 150000,
    paymentMethod: null,
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-09-25T10:00:00Z",
    updatedAt: "2026-09-25T10:00:00Z",
    timeline: [],
    payoutPlanVersion: 2,
    payoutMilestones: milestones,
    ...overrides,
  } as Order;
}

const DELIVERY = {
  fileId: "file_door",
  evidenceType: "photo",
  riderId: "r1",
  recordedAt: "2026-09-27T05:00:00Z",
};

function stage(o: Order, code: string): PayoutMilestone {
  const found = o.payoutMilestones?.find((m) => m.code === code);
  if (!found) throw new Error(`no ${code}`);
  return found;
}

describe("payout plan version", () => {
  it("reads the order's own snapshot", () => {
    expect(payoutPlanVersionOf(order(escrowStages()))).toBe(2);
    expect(payoutPlanVersionOf(order(legacyStages(), { payoutPlanVersion: 1 }))).toBe(1);
  });

  it("is null before a commitment creates the stages", () => {
    expect(payoutPlanVersionOf({ payoutPlanVersion: null, payoutMilestones: [] })).toBeNull();
    expect(payoutPlanVersionOf({})).toBeNull();
  });

  it("treats an order from an API without the field as the legacy plan", () => {
    // An older API sent neither field.
    const legacy = legacyStages().map((m) => ({ ...m, label: undefined, releaseRequires: undefined }));
    expect(payoutPlanVersionOf({ payoutMilestones: legacy })).toBe(1);
    expect(isLegacyPayoutPlan({ payoutMilestones: legacy })).toBe(true);
    // Unless it already carries a stage only the escrow plan issues.
    expect(payoutPlanVersionOf({ payoutMilestones: escrowStages() })).toBe(2);
  });
});

describe("what each stage waits on", () => {
  it("takes releaseRequires from the API, then falls back to the code", () => {
    expect(escrowStages().map(releaseRequirementOf)).toEqual([
      "shop_proof",
      "delivery_proof",
      "issue_window_closed",
    ]);
    expect(releaseRequirementOf({ code: "retention" })).toBe("issue_window_closed");
    expect(releaseRequirementOf({ code: "future_stage", releaseRequires: "shop_proof" })).toBe(
      "shop_proof",
    );
    expect(releaseRequirementOf({ code: "future_stage" })).toBeNull();
  });

  it("needs no file for the escrow plan's last share, but legacy retention still does", () => {
    const escrow = order(escrowStages());
    expect(stageNeedsProof(escrow, stage(escrow, "issue_window"))).toBe(false);
    expect(stageNeedsProof(escrow, stage(escrow, "delivered"))).toBe(true);
    const legacy = order(legacyStages(), { payoutPlanVersion: 1 });
    expect(stageNeedsProof(legacy, stage(legacy, "retention"))).toBe(true);
    expect(windowStageOf(legacy)).toBeNull();
    expect(windowStageOf(escrow)?.code).toBe("issue_window");
    expect(isWindowStage(escrow, stage(escrow, "issue_window"))).toBe(true);
  });

  it("finds the shop's own proof stages in the plan's order", () => {
    expect(shopProofStages(order(escrowStages())).map((m) => m.code)).toEqual([
      "production_started",
    ]);
    expect(
      shopProofStages(order(legacyStages(), { payoutPlanVersion: 1 })).map((m) => m.code),
    ).toEqual(["printing", "packaging_qc"]);
  });

  it("renders a stage it has never seen by the API's label, in array order", () => {
    const future = order([
      { code: "deposit", label: "Deposit", sharePercent: 30, releaseRequires: "shop_proof", status: "pending_pof", pofFileIds: [] },
      { code: "handover", label: "Hand-over", sharePercent: 70, releaseRequires: "delivery_proof", status: "pending_pof", pofFileIds: [] },
    ], { payoutPlanVersion: 3 });
    expect(future.payoutMilestones?.map(milestoneName)).toEqual(["Deposit", "Hand-over"]);
    expect(shopProofStages(future).map((m) => m.code)).toEqual(["deposit"]);
  });
});

describe("stage words", () => {
  it("names escrow stages from the API and keeps the legacy names", () => {
    expect(escrowStages().map(milestoneName)).toEqual([
      "Start of production",
      "Delivered",
      "Issue window closed",
    ]);
    expect(legacyStages().map(milestoneName)).toEqual([
      "Printing in progress",
      "Packaging",
      "Delivered",
      "Client retention",
    ]);
  });

  it("says who supplies each escrow stage, and that the last needs no file", () => {
    const escrow = order(escrowStages());
    expect(escrow.payoutMilestones?.map((m) => milestoneProofSource(m, escrow))).toEqual([
      "Supplier uploads a start-of-production photo",
      "The rider's delivery photo is the proof",
      "No proof needed. Released after the complaint window closes",
    ]);
  });

  it("keeps every legacy proof source word for word", () => {
    const legacy = order(legacyStages(), { payoutPlanVersion: 1 });
    expect(legacy.payoutMilestones?.map((m) => milestoneProofSource(m, legacy))).toEqual([
      "Supplier uploads the proof",
      "Supplier uploads the packed-job photo",
      "Rider uploads the proof at delivery",
      "Covered by the delivered proof",
    ]);
  });

  it("never calls the window share 'Proof needed'", () => {
    expect(presentMilestoneStatus("pending_pof", { needsProof: false }).label).toBe(
      "After the complaint window",
    );
    expect(presentMilestoneStatus("pending_pof").label).toBe("Proof needed");
  });

  it("counts the heading from the order's own plan", () => {
    expect(sharesHeading(3)).toBe("Three shares of what the shop earns");
    expect(sharesHeading(4)).toBe("Four shares of what the shop earns");
  });
});

describe("escrow release blockers, explained before the click", () => {
  it("asks for the shop's start-of-production proof", () => {
    const o = order(escrowStages());
    expect(milestoneReleaseBlocker(o, stage(o, "production_started"))).toMatch(
      /start-of-production photo/,
    );
    expect(milestoneReadiness(o, stage(o, "production_started"))).toBe("waiting_proof");
  });

  it("releases start of production once the proof is in and production is under way", () => {
    const o = order(escrowStages({ production_started: proofOnFile("file_start") }));
    expect(milestoneReleaseBlocker(o, stage(o, "production_started"))).toBeNull();
    expect(releasableMilestones(o).map((m) => m.code)).toEqual(["production_started"]);
    expect(payoutSummary(o)).toBe("Start of production ready to release, ₱400.00.");
  });

  it("waits on the rider's delivery evidence for the delivered share", () => {
    const o = order(escrowStages({ production_started: released("file_start") }), {
      state: "out_for_delivery",
    });
    expect(milestoneReleaseBlocker(o, stage(o, "delivered"))).toMatch(
      /rider has recorded the delivery photo/,
    );
    expect(payoutSummary(o)).toBe("Waiting on the rider's delivery photo for delivered.");
  });

  it("releases delivered once the rider's evidence became its proof", () => {
    const o = order(
      escrowStages({
        production_started: released("file_start"),
        delivered: proofOnFile("file_door"),
      }),
      { state: "issue_window_open", deliveryEvidence: DELIVERY },
    );
    expect(milestoneReleaseBlocker(o, stage(o, "delivered"))).toBeNull();
    expect(releasableMilestones(o).map((m) => m.code)).toEqual(["delivered"]);
  });

  it("holds the last share while the complaint window is still open", () => {
    const o = order(
      escrowStages({
        production_started: released("file_start"),
        delivered: released("file_door"),
      }),
      { state: "issue_window_open", deliveryEvidence: DELIVERY },
    );
    const last = stage(o, "issue_window");
    expect(milestoneReleaseBlocker(o, last)).toMatch(/client can still report a problem/);
    expect(milestoneReadiness(o, last)).toBe("not_reached");
    expect(readyWindowShare(o)).toBeNull();
    expect(payoutQueueGroup(o)).toBe("waiting");
  });

  it("holds the last share while a claim is open, even after the window", () => {
    const o = order(
      escrowStages({
        production_started: released("file_start"),
        delivered: released("file_door"),
      }),
      { state: "completed", deliveryEvidence: DELIVERY, payoutHold: true },
    );
    expect(milestoneReleaseBlocker(o, stage(o, "issue_window"))).toBe(
      PLATFORM_CONSTRAINT_COPY.payout_held.guidance,
    );
    expect(readyWindowShare(o)).toBeNull();
  });

  it("offers the last share once the window has closed with nothing raised (gridgo-web#58)", () => {
    const o = order(
      escrowStages({
        production_started: released("file_start"),
        delivered: released("file_door"),
      }),
      { state: "completed", deliveryEvidence: DELIVERY },
    );
    const last = stage(o, "issue_window");
    expect(milestoneReleaseBlocker(o, last)).toBeNull();
    expect(milestoneReadiness(o, last)).toBe("ready");
    expect(readyWindowShare(o)?.code).toBe("issue_window");
    expect(payoutQueueGroup(o)).toBe("ready");
    expect(payoutSummary(o)).toBe(
      "Complaint window closed with nothing raised. The last 25% is ready to release, ₱250.00.",
    );
  });

  it("never offers the one-press release on a legacy order, whose retention releases itself", () => {
    const o = order(
      legacyStages({
        printing: released("a"),
        packaging_qc: released("b"),
        delivered: released("c"),
        retention: proofOnFile("c"),
      }),
      { state: "completed", payoutPlanVersion: 1, deliveryEvidence: DELIVERY },
    );
    expect(readyWindowShare(o)).toBeNull();
  });

  it("keeps the legacy gates and words exactly", () => {
    const o = order(legacyStages(), { payoutPlanVersion: 1, state: "issue_window_open" });
    expect(milestoneReleaseBlocker(o, stage(o, "printing"))).toBe(
      PLATFORM_CONSTRAINT_COPY.pof_required.guidance,
    );
    const withProof = order(
      legacyStages({ retention: proofOnFile("c") }),
      { payoutPlanVersion: 1, state: "issue_window_open", deliveryEvidence: DELIVERY },
    );
    expect(milestoneReleaseBlocker(withProof, stage(withProof, "retention"))).toBe(
      "Retention releases when the issue window has expired and the order has completed.",
    );
  });
});

describe("the rider's evidence as the delivered proof", () => {
  it("says who filed it and when, without an attach row of its own", () => {
    const o = order(escrowStages({ delivered: proofOnFile("file_door") }), {
      deliveryEvidence: DELIVERY,
    });
    const [proof] = milestoneProofs(o, stage(o, "delivered"));
    expect(proof).toMatchObject({
      fileId: "file_door",
      attachedAt: "2026-09-27T05:00:00Z",
      attachedBy: "Rider",
      inherited: false,
    });
  });
});

describe("the shop's proof on an escrow order", () => {
  it("asks for one start-of-production photo, then lets the job be packed", () => {
    const open = order(escrowStages());
    expect(nextShopProof(open)?.code).toBe("production_started");
    expect(actionsForJob(open)).toEqual([
      expect.objectContaining({
        kind: "add_proof",
        label: "Add start-of-production proof",
        milestoneCode: "production_started",
        proofLabel: "Start of production",
      }),
    ]);

    const filed = order(escrowStages({ production_started: proofOnFile("file_start") }));
    expect(actionsForJob(filed).map((a) => a.label)).toEqual(["Package for pickup"]);
  });

  it("never asks the shop for the delivered or window shares", () => {
    const o = order(
      escrowStages({ production_started: released("file_start") }),
      { state: "issue_window_open" },
    );
    expect(nextShopProof(o)).toBeNull();
    expect(actionsForJob(o)).toEqual([]);
  });

  it("tells a delivered shop who pays the last share, and keeps legacy words", () => {
    const escrow = order(escrowStages(), { state: "issue_window_open" });
    expect(supplierWaitingOn("issue_window_open", escrow)).toBe(
      "Delivered. Your last share is released by Operations once the client's complaint window closes with nothing raised.",
    );
    const legacy = order(legacyStages(), { payoutPlanVersion: 1 });
    expect(supplierWaitingOn("issue_window_open", legacy)).toMatch(/^Delivered\. Retention/);
    expect(supplierWaitingOn("issue_window_open")).toMatch(/^Delivered\. Retention/);
  });
});
