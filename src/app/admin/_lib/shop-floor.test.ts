import { describe, expect, it } from "vitest";

import type { SupplierService, User } from "@/lib/api/types";

import {
  assembleFloorShops,
  floorHeadline,
  listingsFromPublicShop,
} from "./shop-floor";

function svc(
  partial: Partial<SupplierService> & Pick<SupplierService, "id" | "supplierId" | "state">,
): SupplierService {
  return {
    categoryCode: "marketing_collateral",
    materialCodes: [],
    finishCodes: [],
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

describe("shop floor", () => {
  it("lists accredited shops even when they have no public listing", () => {
    const shops = assembleFloorShops({
      categoryCode: "marketing_collateral",
      services: [
        svc({ id: "a", supplierId: "shop_a", state: "live" }),
        svc({ id: "b", supplierId: "shop_b", state: "pending_verification" }),
      ],
      users: [
        { id: "shop_a", email: "a@x", name: "Ann", role: "supplier", supplierName: "Printlab" },
        { id: "shop_b", email: "b@x", name: "Ben", role: "supplier", supplierName: "Inkhouse" },
      ] as User[],
      publicRows: [
        {
          supplierId: "shop_a",
          shopName: "Printlab",
          listings: [
            {
              id: "item_1",
              name: "A5 Flyers",
              subcategoryCode: "flyers",
              fromPriceMinor: 800,
              printerMaxWidthFeet: null,
              photoFileId: "file_1",
            },
          ],
        },
      ],
    });
    expect(shops.map((s) => s.shopName)).toEqual(["Printlab", "Inkhouse"]);
    expect(shops[0].listings).toHaveLength(1);
    expect(shops[1].listings).toHaveLength(0);
    expect(shops[1].serviceState).toBe("pending_verification");
  });

  it("keeps only listings of the print job being inspected", () => {
    const shops = assembleFloorShops({
      categoryCode: "marketing_collateral",
      subcategoryCode: "flyers",
      services: [svc({ id: "a", supplierId: "shop_a", state: "live" })],
      users: [],
      publicRows: [
        {
          supplierId: "shop_a",
          shopName: "Printlab",
          listings: [
            {
              id: "item_1",
              name: "A5 Flyers",
              subcategoryCode: "flyers",
              fromPriceMinor: 800,
              printerMaxWidthFeet: null,
              photoFileId: null,
            },
            {
              id: "item_2",
              name: "Folded brochures",
              subcategoryCode: "brochures",
              fromPriceMinor: 1200,
              printerMaxWidthFeet: null,
              photoFileId: null,
            },
          ],
        },
      ],
    });
    expect(shops[0].listings.map((l) => l.name)).toEqual(["A5 Flyers"]);
  });

  it("reads listings off a public shop payload", () => {
    const listings = listingsFromPublicShop(
      {
        supplierId: "shop_a",
        shopName: "Printlab",
        services: [
          {
            id: "svc",
            categoryCode: "marketing_collateral",
            items: [
              {
                id: "item_1",
                name: "A5 Flyers",
                subcategoryCode: "flyers",
                fromPriceMinor: 800,
                photos: [{ fileId: "file_1" }],
              },
            ],
          },
        ],
      },
      "flyers",
    );
    expect(listings).toEqual([
      {
        id: "item_1",
        name: "A5 Flyers",
        subcategoryCode: "flyers",
        fromPriceMinor: 800,
        printerMaxWidthFeet: null,
        photoFileId: "file_1",
      },
    ]);
  });

  it("writes a floor headline without snake_case", () => {
    const copy = floorHeadline(
      [
        {
          supplierId: "a",
          shopName: "Printlab",
          serviceState: "live",
          listings: [
            {
              id: "1",
              name: "Flyers",
              subcategoryCode: "flyers",
              fromPriceMinor: 1,
              printerMaxWidthFeet: null,
              photoFileId: null,
            },
          ],
        },
        {
          supplierId: "b",
          shopName: "Inkhouse",
          serviceState: "live",
          listings: [],
        },
      ],
      "Flyers",
    );
    expect(copy.title).toBe("2 shops accredited");
    expect(copy.body).toMatch(/1 listing on the board from 1 shop/);
    expect(copy.body).not.toMatch(/_/);
  });

  it("keeps a tarpaulin printer cap in feet on the floor listing", () => {
    const listings = listingsFromPublicShop({
      supplierId: "shop_a",
      shopName: "Polymedia",
      services: [
        {
          id: "svc",
          categoryCode: "marketing_collateral",
          items: [
            {
              id: "item_tarp",
              name: "Storefront tarpaulin",
              subcategoryCode: "tarpaulins_outdoor_banners",
              fromPriceMinor: 150000,
              printerMaxWidthFeet: 5,
            },
            {
              id: "item_flyer",
              name: "A5 Flyers",
              subcategoryCode: "flyers",
              fromPriceMinor: 800,
            },
          ],
        },
      ],
    });
    expect(listings).toEqual([
      {
        id: "item_tarp",
        name: "Storefront tarpaulin",
        subcategoryCode: "tarpaulins_outdoor_banners",
        fromPriceMinor: 150000,
        printerMaxWidthFeet: 5,
        photoFileId: null,
      },
      {
        id: "item_flyer",
        name: "A5 Flyers",
        subcategoryCode: "flyers",
        fromPriceMinor: 800,
        printerMaxWidthFeet: null,
        photoFileId: null,
      },
    ]);
  });
});
