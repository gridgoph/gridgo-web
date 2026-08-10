import { describe, expect, it } from "vitest";

import {
  buildCapacitySnapshot,
  committedLoad,
  formatCapacityFigure,
  isCapacityCommitting,
  sumDeclaredCapacity,
} from "./capacity";
import type { Order, SupplierService } from "@/lib/api/types";

function service(
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
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function job(
  partial: Partial<Order> & Pick<Order, "id" | "state" | "quantity">,
): Order {
  return {
    clientId: "c1",
    supplierId: "user_supplier",
    riderId: null,
    productId: "p1",
    title: "Job",
    size: "A4",
    material: "matte",
    deadline: null,
    address: "",
    zone: "davao_central",
    totalMinor: 1000,
    deliveryFeeMinor: 0,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "",
    updatedAt: "",
    timeline: [],
    ...partial,
  };
}

describe("isCapacityCommitting", () => {
  it("counts production pipeline, not delivery", () => {
    expect(isCapacityCommitting("production")).toBe(true);
    // A job commits the shop from the moment it is accepted and priced,
    // through payment review, not only once production starts.
    expect(isCapacityCommitting("awaiting_downpayment")).toBe(true);
    expect(isCapacityCommitting("downpayment_review")).toBe(true);
    expect(isCapacityCommitting("supplier_assigned")).toBe(false);
    expect(isCapacityCommitting("rider_assigned")).toBe(false);
    expect(isCapacityCommitting("delivered")).toBe(false);
  });
});

describe("sumDeclaredCapacity", () => {
  it("sums only live lines and leaves null when unset", () => {
    const declared = sumDeclaredCapacity([
      service({ id: "1", state: "live", capacityDaily: 20, capacityWeekly: 100 }),
      service({ id: "2", state: "live", capacityDaily: 40, capacityWeekly: null }),
      service({ id: "3", state: "draft", capacityDaily: 99, capacityWeekly: 99 }),
      service({ id: "4", state: "suspended", capacityDaily: 5, capacityWeekly: 25 }),
    ]);
    expect(declared.daily).toBe(60);
    expect(declared.weekly).toBe(100);
    expect(declared.liveLineCount).toBe(2);
    expect(declared.linesWithWeekly).toBe(1);
  });

  it("returns null daily when no live line declares it", () => {
    const declared = sumDeclaredCapacity([
      service({ id: "1", state: "live", capacityDaily: null, capacityWeekly: 50 }),
    ]);
    expect(declared.daily).toBeNull();
    expect(declared.weekly).toBe(50);
  });
});

describe("committedLoad", () => {
  it("sums quantities for committing jobs only", () => {
    const load = committedLoad([
      job({ id: "a", state: "production", quantity: 5 }),
      job({ id: "b", state: "rider_assigned", quantity: 10 }),
      job({ id: "c", state: "downpayment_review", quantity: 2 }),
    ]);
    expect(load.jobCount).toBe(2);
    expect(load.unitCount).toBe(7);
  });
});

describe("buildCapacitySnapshot", () => {
  it("computes remaining without inventing missing sides", () => {
    const snap = buildCapacitySnapshot(
      [service({ id: "1", state: "live", capacityDaily: 20, capacityWeekly: 100 })],
      [job({ id: "a", state: "production", quantity: 5 })],
    );
    expect(snap.remainingDaily).toBe(15);
    expect(snap.remainingWeekly).toBe(95);
  });

  it("leaves remaining null when declared is missing", () => {
    const snap = buildCapacitySnapshot(
      [service({ id: "1", state: "live", capacityDaily: null, capacityWeekly: null })],
      [job({ id: "a", state: "production", quantity: 5 })],
    );
    expect(snap.remainingDaily).toBeNull();
    expect(snap.remainingWeekly).toBeNull();
    expect(snap.notes.some((n) => /Daily capacity is not set/i.test(n))).toBe(
      true,
    );
  });
});

describe("formatCapacityFigure", () => {
  it("labels null as unavailable and pluralises units", () => {
    expect(formatCapacityFigure(null)).toBe("Unavailable");
    expect(formatCapacityFigure(1)).toBe("1 unit");
    expect(formatCapacityFigure(12)).toBe("12 units");
  });
});
