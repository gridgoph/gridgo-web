import { describe, expect, it } from "vitest";

import {
  filterShopBlocks,
  groupIntoSections,
  groupServiceLinesByShop,
  isMakeAllLiveEligible,
  presentServiceLineSections,
  sectionForBlock,
  taxonomyNames,
} from "@/components/approvals/service-lines-groups";
import type { SupplierService, User } from "@/lib/api/types";

function service(
  partial: Partial<SupplierService> &
    Pick<SupplierService, "id" | "supplierId" | "categoryCode" | "state">,
): SupplierService {
  return {
    materialCodes: [],
    finishCodes: [],
    productFamilyIds: [],
    sizeMin: null,
    sizeMax: null,
    qtyMin: null,
    qtyMax: null,
    pricingBasis: "per_piece",
    referenceRateMinor: 1200,
    turnaroundHours: 48,
    capacityDaily: null,
    capacityWeekly: null,
    zones: [],
    equipmentNotes: "",
    verifiedAt: null,
    suspendedAt: null,
    suspendReason: null,
    withdrawnAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...partial,
  };
}

function supplier(partial: Partial<User> & Pick<User, "id" | "name">): User {
  return {
    email: `${partial.id}@example.com`,
    role: "supplier",
    verificationStatus: "approved",
    ...partial,
  };
}

const names = taxonomyNames({
  categories: [
    {
      id: "c1",
      code: "flyers",
      name: "Flyers",
      productFamilyIds: [],
      active: true,
    },
    {
      id: "c2",
      code: "tarpaulins_outdoor_banners",
      name: "Tarpaulins & outdoor banners",
      productFamilyIds: [],
      active: true,
    },
    {
      id: "c3",
      code: "calling_cards",
      name: "Calling cards",
      productFamilyIds: [],
      active: true,
    },
  ],
  materials: [],
  finishes: [],
});

const shops = [
  supplier({
    id: "user_alpha",
    name: "Ana Cruz",
    supplierName: "Alpha Print",
    phone: "0917 000 0001",
    shop: { lat: 7.07, lng: 125.61, label: "JP Laurel, Davao" },
    verificationStatus: "approved",
  }),
  supplier({
    id: "user_beta",
    name: "Ben Santos",
    supplierName: "Beta Press",
    verificationStatus: "pending",
  }),
  supplier({
    id: "user_gamma",
    name: "Gina Reyes",
    supplierName: "Gamma Shop",
    verificationStatus: "approved",
  }),
  supplier({
    id: "user_delta",
    name: "Dan Lim",
    supplierName: "Delta Signs",
    verificationStatus: "approved",
  }),
];

const lines: SupplierService[] = [
  service({
    id: "svc_alpha_flyers",
    supplierId: "user_alpha",
    categoryCode: "flyers",
    state: "pending_verification",
    zones: ["davao_central"],
    updatedAt: "2026-09-10T10:00:00Z",
  }),
  service({
    id: "svc_alpha_tarp",
    supplierId: "user_alpha",
    categoryCode: "tarpaulins_outdoor_banners",
    state: "draft",
    zones: ["davao_north"],
    updatedAt: "2026-09-12T10:00:00Z",
  }),
  service({
    id: "svc_alpha_cards",
    supplierId: "user_alpha",
    categoryCode: "calling_cards",
    state: "live",
    zones: ["davao_central"],
    updatedAt: "2026-09-14T10:00:00Z",
  }),
  service({
    id: "svc_beta_flyers",
    supplierId: "user_beta",
    categoryCode: "flyers",
    state: "pending_verification",
    zones: ["davao_south"],
    updatedAt: "2026-09-15T10:00:00Z",
  }),
  service({
    id: "svc_gamma_live",
    supplierId: "user_gamma",
    categoryCode: "flyers",
    state: "live",
    zones: ["davao_east"],
    updatedAt: "2026-09-11T10:00:00Z",
  }),
  service({
    id: "svc_delta_suspended",
    supplierId: "user_delta",
    categoryCode: "flyers",
    state: "suspended",
    zones: ["davao_west"],
    updatedAt: "2026-09-08T10:00:00Z",
  }),
  service({
    id: "svc_delta_withdrawn",
    supplierId: "user_delta",
    categoryCode: "calling_cards",
    state: "withdrawn",
    zones: ["davao_west"],
    updatedAt: "2026-09-09T10:00:00Z",
  }),
  service({
    id: "svc_ghost_flyers",
    supplierId: "user_missing",
    categoryCode: "flyers",
    state: "pending_verification",
    zones: ["davao_central"],
    updatedAt: "2026-09-01T10:00:00Z",
  }),
];

describe("groupServiceLinesByShop", () => {
  it("groups lines by supplier and keeps a block when the directory has no record", () => {
    const blocks = groupServiceLinesByShop(lines, shops);
    expect(blocks.map((block) => block.supplierId).sort()).toEqual([
      "user_alpha",
      "user_beta",
      "user_delta",
      "user_gamma",
      "user_missing",
    ]);
    const ghost = blocks.find((block) => block.supplierId === "user_missing");
    expect(ghost?.detailsUnavailable).toBe(true);
    expect(ghost?.shopName).toBe("user_missing");
    expect(ghost?.accountApproved).toBe(false);
    const alpha = blocks.find((block) => block.supplierId === "user_alpha");
    expect(alpha?.shopName).toBe("Alpha Print");
    expect(alpha?.contactName).toBe("Ana Cruz");
    expect(alpha?.lines.map((line) => line.id)).toEqual([
      "svc_alpha_tarp",
      "svc_alpha_flyers",
      "svc_alpha_cards",
    ]);
  });
});

describe("section assignment", () => {
  it("puts a shop in waiting if any line is waiting, else live, else suspended", () => {
    const sections = groupIntoSections(groupServiceLinesByShop(lines, shops));
    expect(sections.waiting.map((block) => block.supplierId)).toEqual([
      "user_alpha",
      "user_beta",
      "user_missing",
    ]);
    expect(sections.live.map((block) => block.supplierId)).toEqual(["user_gamma"]);
    expect(sections.suspended.map((block) => block.supplierId)).toEqual(["user_delta"]);
    expect(sectionForBlock(sections.waiting[0]!)).toBe("waiting");
    expect(sectionForBlock(sections.live[0]!)).toBe("live");
    expect(sectionForBlock(sections.suspended[0]!)).toBe("suspended");
  });
});

describe("waiting-first ordering", () => {
  it("orders waiting shops by most waiting lines, then most recent update", () => {
    const extra = [
      ...lines,
      service({
        id: "svc_beta_tarp",
        supplierId: "user_beta",
        categoryCode: "tarpaulins_outdoor_banners",
        state: "draft",
        updatedAt: "2026-09-16T10:00:00Z",
      }),
      service({
        id: "svc_beta_cards",
        supplierId: "user_beta",
        categoryCode: "calling_cards",
        state: "pending_verification",
        updatedAt: "2026-09-17T10:00:00Z",
      }),
    ];
    const sections = groupIntoSections(groupServiceLinesByShop(extra, shops));
    expect(sections.waiting.map((block) => block.supplierId)).toEqual([
      "user_beta",
      "user_alpha",
      "user_missing",
    ]);
    expect(sections.waiting[0]?.waitingCount).toBe(3);
    expect(sections.waiting[1]?.waitingCount).toBe(2);
  });

  it("orders lines inside a block waiting, then live, then the rest, each newest first", () => {
    const alpha = groupServiceLinesByShop(lines, shops).find(
      (block) => block.supplierId === "user_alpha",
    );
    expect(alpha?.lines.map((line) => [line.state, line.id])).toEqual([
      ["draft", "svc_alpha_tarp"],
      ["pending_verification", "svc_alpha_flyers"],
      ["live", "svc_alpha_cards"],
    ]);
  });
});

describe("make all eligibility", () => {
  it("needs an approved account and two or more pending lines", () => {
    const blocks = groupServiceLinesByShop(lines, shops);
    const byId = Object.fromEntries(blocks.map((block) => [block.supplierId, block]));
    expect(isMakeAllLiveEligible(byId.user_alpha!)).toBe(true);
    expect(isMakeAllLiveEligible(byId.user_beta!)).toBe(false);
    expect(isMakeAllLiveEligible(byId.user_gamma!)).toBe(false);
    expect(isMakeAllLiveEligible(byId.user_missing!)).toBe(false);
  });
});

describe("filter matching", () => {
  it("matches shop name, contact name, category name, or zone, and drops empty shops", () => {
    const blocks = groupServiceLinesByShop(lines, shops);

    const byShop = filterShopBlocks(blocks, "alpha print", names);
    expect(byShop.map((block) => block.supplierId)).toEqual(["user_alpha"]);
    expect(byShop[0]?.lines).toHaveLength(3);

    const byContact = filterShopBlocks(blocks, "ben santos", names);
    expect(byContact.map((block) => block.supplierId)).toEqual(["user_beta"]);

    const byCategory = filterShopBlocks(blocks, "tarpaulins", names);
    expect(byCategory.map((block) => block.supplierId)).toEqual(["user_alpha"]);
    expect(byCategory[0]?.lines.map((line) => line.categoryCode)).toEqual([
      "tarpaulins_outdoor_banners",
    ]);

    const byZone = filterShopBlocks(blocks, "davao north", names);
    expect(byZone.map((block) => block.supplierId)).toEqual(["user_alpha"]);
    expect(byZone[0]?.lines.map((line) => line.id)).toEqual(["svc_alpha_tarp"]);

    const none = filterShopBlocks(blocks, "no such shop", names);
    expect(none).toEqual([]);
  });

  it("reassigns a shop's section after filtering hides its waiting lines", () => {
    const sections = presentServiceLineSections(lines, shops, "calling cards", names);
    expect(sections.waiting.map((block) => block.supplierId)).toEqual([]);
    expect(sections.live.map((block) => block.supplierId)).toEqual(["user_alpha"]);
    expect(sections.suspended.map((block) => block.supplierId)).toEqual(["user_delta"]);
  });
});
