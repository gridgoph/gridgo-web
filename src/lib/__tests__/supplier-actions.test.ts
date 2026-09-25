import { describe, expect, it } from "vitest";

import type { PayoutMilestone } from "@/lib/api/types";
import { presentOrderState } from "@/lib/order-state";
import {
  actionsForJob,
  needsSupplierAction,
  primaryAction,
  supplierWaitingOn,
} from "@/lib/supplier-actions";

function job(
  state: string,
  milestones: PayoutMilestone[] = [],
  payoutHold = false,
) {
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
    expect(primaryAction(job("supplier_assigned"))?.targetState).toBe("payment_authorized");
    expect(primaryAction(job("supplier_assigned"))?.label).toBe("Accept job");
    const decline = actions.find((a) => a.kind === "decline");
    expect(decline?.targetState).toBe("approved_for_matching");
    expect(actions.filter((a) => a.kind !== "accept" && a.kind !== "decline")).toEqual([]);
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

  it("asks for printing proof before the job can be packaged", () => {
    const actions = actionsForJob(
      job("production", [
        milestone("printing", "pending_pof"),
        milestone("packaging_qc", "pending_pof"),
      ]),
    );
    expect(actions).toEqual([
      {
        kind: "add_proof",
        label: "Add printing proof",
        targetState: null,
        primary: true,
        milestoneCode: "printing",
      },
    ]);
    expect(actions.some((action) => action.label === "Package for pickup")).toBe(false);
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
    expect(actions.map((action) => action.kind)).toEqual(["add_proof"]);
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
    expect(actionsForJob(job("production", filed)).map((action) => action.label)).toEqual([
      "Package for pickup",
    ]);
    expect(primaryAction(job("production", filed))?.targetState).toBe("ready_for_dispatch");
    expect(primaryAction(job("supplier_self_qc", filed))?.label).toBe("Package for pickup");
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
