import { describe, expect, it } from "vitest";

import {
  actionsForJob,
  needsSupplierAction,
  primaryAction,
} from "@/lib/supplier-actions";
import { presentOrderState } from "@/lib/order-state";

describe("presentOrderState", () => {
  it("maps supplier states to plain language without snake_case", () => {
    expect(presentOrderState("supplier_assigned").label).toBe("Awaiting supplier decision");
    expect(presentOrderState("payment_authorized").label).toBe("Paid — start production");
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

  it("offers a single primary production action chain", () => {
    expect(primaryAction("supplier_accepted")?.targetState).toBe("awaiting_payment");
    expect(primaryAction("payment_authorized")?.targetState).toBe("production");
    expect(primaryAction("production")?.targetState).toBe("supplier_self_qc");
    expect(primaryAction("supplier_self_qc")?.targetState).toBe("ready_for_dispatch");
  });

  it("returns no actions for terminal supplier states", () => {
    expect(actionsForJob("ready_for_dispatch")).toEqual([]);
    expect(actionsForJob("completed")).toEqual([]);
    expect(needsSupplierAction("ready_for_dispatch")).toBe(false);
  });
});
