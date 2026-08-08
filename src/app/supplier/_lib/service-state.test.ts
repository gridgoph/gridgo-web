import { describe, expect, it } from "vitest";

import {
  actionsForService,
  presentPricingBasis,
  presentServiceState,
  sortServices,
} from "./service-state";
import type { SupplierService } from "@/lib/api/types";

function svc(
  partial: Partial<SupplierService> & Pick<SupplierService, "id" | "state">,
): SupplierService {
  return {
    supplierId: "user_supplier",
    categoryCode: "large_format",
    materialCodes: [],
    finishCodes: [],
    productFamilyIds: [],
    sizeMin: null,
    sizeMax: null,
    qtyMin: null,
    qtyMax: null,
    pricingBasis: "per_sqm",
    referenceRateMinor: 0,
    turnaroundHours: 24,
    capacityDaily: null,
    capacityWeekly: null,
    zones: [],
    equipmentNotes: "",
    verifiedAt: null,
    suspendedAt: null,
    suspendReason: null,
    withdrawnAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("presentServiceState", () => {
  it("maps every lifecycle state to plain language without snake_case", () => {
    for (const state of [
      "draft",
      "pending_verification",
      "live",
      "suspended",
      "withdrawn",
    ] as const) {
      const p = presentServiceState(state);
      expect(p.label).not.toMatch(/_/);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("explains why draft is not live and what happens next", () => {
    const p = presentServiceState("draft");
    expect(p.whyNotLive).toMatch(/draft/i);
    expect(p.nextStep).toMatch(/submit/i);
  });

  it("includes suspend reason when present", () => {
    const p = presentServiceState("suspended", {
      suspendReason: "Missing equipment proof",
    });
    expect(p.whyNotLive).toContain("Missing equipment proof");
  });

  it("states that withdraw does not abandon in-flight orders", () => {
    const p = presentServiceState("withdrawn");
    expect(p.whyNotLive).toMatch(/in-flight/i);
    expect(p.whyNotLive).not.toMatch(/abandon/i);
  });

  it("live has no whyNotLive", () => {
    expect(presentServiceState("live").whyNotLive).toBeNull();
  });
});

describe("actionsForService", () => {
  it("allows submit from draft and suspended, not from live", () => {
    expect(actionsForService("draft").some((a) => a.kind === "submit")).toBe(
      true,
    );
    expect(
      actionsForService("suspended").some((a) => a.kind === "submit"),
    ).toBe(true);
    expect(actionsForService("live").some((a) => a.kind === "submit")).toBe(
      false,
    );
  });

  it("allows re-submit after withdraw", () => {
    expect(
      actionsForService("withdrawn").some((a) => a.kind === "submit"),
    ).toBe(true);
  });

  it("marks withdraw as destructive", () => {
    const w = actionsForService("live").find((a) => a.kind === "withdraw");
    expect(w?.destructive).toBe(true);
  });
});

describe("presentPricingBasis", () => {
  it("maps known codes", () => {
    expect(presentPricingBasis("per_sqm")).toBe("Per square metre");
    expect(presentPricingBasis("per_pack")).toBe("Per pack");
  });
});

describe("sortServices", () => {
  it("puts draft and suspended before live and withdrawn", () => {
    const sorted = sortServices([
      svc({ id: "a", state: "live", categoryCode: "z" }),
      svc({ id: "b", state: "draft", categoryCode: "a" }),
      svc({ id: "c", state: "withdrawn", categoryCode: "m" }),
      svc({ id: "d", state: "suspended", categoryCode: "b" }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "d", "a", "c"]);
  });
});
