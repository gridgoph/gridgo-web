import { describe, expect, it } from "vitest";

import {
  actionsForJob,
  needsSupplierAction,
  primaryAction,
  supplierWaitingOn,
} from "@/lib/supplier-actions";
import { presentOrderState } from "@/lib/order-state";

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
    const actions = actionsForJob("supplier_assigned");
    expect(actions.map((a) => a.kind)).toEqual(["accept", "decline"]);
    expect(actions.filter((a) => a.primary)).toHaveLength(1);
    expect(primaryAction("supplier_assigned")?.targetState).toBe("supplier_accepted");
  });

  it("makes accepting the step that carries the supplier's price", () => {
    expect(primaryAction("supplier_assigned")?.needsPrice).toBe(true);
  });

  it("leaves payment to the client and Operations", () => {
    // The supplier no longer asks for payment; the client is told the price
    // automatically on acceptance and Operations confirms the transfer.
    expect(actionsForJob("awaiting_downpayment")).toEqual([]);
    expect(actionsForJob("downpayment_review")).toEqual([]);
    expect(supplierWaitingOn("downpayment_review")).toMatch(/Operations/);
  });

  it("has no actions left in the retired supplier-proof loop", () => {
    for (const state of [
      "supplier_proof_review",
      "supplier_proof_changes_requested",
      "supplier_proof_approved",
      "awaiting_payment",
    ]) {
      expect(actionsForJob(state)).toEqual([]);
    }
  });

  it("offers a single primary production action chain", () => {
    expect(primaryAction("payment_authorized")?.targetState).toBe("production");
    expect(primaryAction("production")?.targetState).toBe("ready_for_dispatch");
    expect(primaryAction("supplier_self_qc")?.targetState).toBe("ready_for_dispatch");
  });

  it("returns no actions for terminal supplier states", () => {
    expect(actionsForJob("ready_for_dispatch")).toEqual([]);
    expect(actionsForJob("completed")).toEqual([]);
    expect(needsSupplierAction("ready_for_dispatch")).toBe(false);
  });
});
