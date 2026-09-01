import { describe, expect, it } from "vitest";

import type { SupplierService, TaxonomyCategoryAlias } from "@/lib/api/types";

import {
  printJobConsequenceCopy,
  shopsAccreditedCopy,
  usageForCategory,
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

const aliases: TaxonomyCategoryAlias[] = [
  {
    code: "large_format",
    name: "Large format",
    categoryCode: "marketing_collateral",
    active: true,
  },
];

describe("taxonomy usage", () => {
  it("counts unique shops, taking the strongest state", () => {
    const services = [
      svc({ id: "1", supplierId: "a", state: "live", categoryCode: "marketing_collateral" }),
      svc({ id: "2", supplierId: "a", state: "draft", categoryCode: "marketing_collateral" }),
      svc({ id: "3", supplierId: "b", state: "draft", categoryCode: "marketing_collateral" }),
      svc({ id: "4", supplierId: "c", state: "live", categoryCode: "corporate_event_merch" }),
    ];
    const u = usageForCategory(services, "marketing_collateral");
    expect(u.total).toBe(2);
    expect(u.live).toBe(1);
    expect(u.other).toBe(1);
  });

  it("resolves retired category codes through aliases", () => {
    const services = [
      svc({ id: "1", supplierId: "a", state: "live", categoryCode: "large_format" }),
      svc({
        id: "2",
        supplierId: "b",
        state: "live",
        categoryCode: "marketing_collateral",
      }),
    ];
    const u = usageForCategory(services, "marketing_collateral", aliases);
    expect(u.total).toBe(2);
    expect(u.live).toBe(2);
  });

  it("writes shop copy without snake_case", () => {
    const copy = shopsAccreditedCopy({
      total: 2,
      live: 1,
      pending: 0,
      other: 1,
    });
    expect(copy).toMatch(/2 shops are accredited/);
    expect(copy).toMatch(/1 live/);
    expect(copy).not.toMatch(/_/);
    expect(
      shopsAccreditedCopy({ total: 0, live: 0, pending: 0, other: 0 }),
    ).toMatch(/No shops are accredited/);
  });

  it("does not invent a listing count for print jobs", () => {
    const copy = printJobConsequenceCopy();
    expect(copy).toMatch(/listings of this job/);
    expect(copy).not.toMatch(/\d/);
  });
});
