import { describe, expect, it } from "vitest";

import type { SupplierService } from "@/lib/api/types";

import {
  usageBlastCopy,
  usageForCategory,
  usageForMaterial,
} from "./taxonomy-usage";

function svc(
  partial: Partial<SupplierService> & Pick<SupplierService, "id" | "state">,
): SupplierService {
  return {
    supplierId: "s",
    categoryCode: "large_format",
    materialCodes: ["tarpaulin_13oz"],
    finishCodes: ["hem_grommet"],
    productFamilyIds: [],
    sizeMin: null,
    sizeMax: null,
    qtyMin: null,
    qtyMax: null,
    pricingBasis: "unit",
    referenceRateMinor: 0,
    turnaroundHours: 24,
    capacityDaily: 5,
    capacityWeekly: 25,
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

describe("taxonomy usage", () => {
  it("counts live vs other for a category", () => {
    const services = [
      svc({ id: "1", state: "live", categoryCode: "large_format" }),
      svc({ id: "2", state: "draft", categoryCode: "large_format" }),
      svc({ id: "3", state: "live", categoryCode: "offset" }),
    ];
    const u = usageForCategory(services, "large_format");
    expect(u.total).toBe(2);
    expect(u.live).toBe(1);
    expect(u.other).toBe(1);
  });

  it("counts material references", () => {
    const services = [
      svc({
        id: "1",
        state: "live",
        materialCodes: ["tarpaulin_13oz", "other"],
      }),
      svc({ id: "2", state: "live", materialCodes: ["other"] }),
    ];
    expect(usageForMaterial(services, "tarpaulin_13oz").total).toBe(1);
  });

  it("writes blast copy without snake_case", () => {
    const copy = usageBlastCopy(
      { total: 2, live: 1, pending: 0, other: 1 },
      "category",
    );
    expect(copy).toMatch(/live service/);
    expect(copy).not.toMatch(/_/);
    expect(usageBlastCopy({ total: 0, live: 0, pending: 0, other: 0 }, "material")).toMatch(
      /No supplier services/,
    );
  });
});
