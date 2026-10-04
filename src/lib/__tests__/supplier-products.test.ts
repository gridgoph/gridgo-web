import { describe, expect, it } from "vitest";

import {
  listingBoardState,
  normalizeStaffCatalogDetail,
  normalizeStaffCatalogPage,
  shopLabel,
  staffCatalogRequest,
} from "@/lib/supplier-products";

const sticker = {
  shop: { supplierId: "metre", shopName: "Metre Press" },
  item: {
    id: "sticker",
    supplierServiceId: "svc_metre",
    subcategoryCode: "stickers",
    name: "Die-cut sticker",
    description: "Vinyl cut to length",
    basePriceMinor: 2500,
    pricingUnit: "per_length",
    measureUnit: "m",
    active: true,
    updatedAt: "2026-10-02T00:00:00.000Z",
    photos: [{ fileId: "photo_sticker", sortOrder: 0, altText: "Sticker roll" }],
    optionGroups: [
      {
        id: "finish",
        name: "Finish",
        kind: "spec",
        required: false,
        options: [{ id: "gloss", label: "Gloss", priceModifierMinor: 0, sortOrder: 0 }],
      },
    ],
  },
};

describe("staff catalog rows", () => {
  it("keeps the shop on a sticker priced per metre and does not invent an approval status", () => {
    const page = normalizeStaffCatalogPage({
      items: [sticker],
      shops: [sticker.shop],
      total: 1,
    });
    expect(page.rows).toHaveLength(1);
    expect(shopLabel(page.rows[0]!.shop)).toBe("Metre Press");
    expect(page.rows[0]!.listing.pricingUnit).toBe("per_length");
    expect(page.rows[0]!.listing.measureUnit).toBe("m");
    expect(page.rows[0]!.listing.onTheBoard).toBe(true);
    expect(listingBoardState(page.rows[0]!.listing).label).toBe("On the board");
    expect(listingBoardState({ onTheBoard: false, suspendReason: null }).label).toBe(
      "Hidden by the shop",
    );
    expect(
      listingBoardState({ onTheBoard: false, suspendReason: "Blurry sample" }).label,
    ).toBe("Taken down");
    expect(page.rows[0]).not.toHaveProperty("approvalStatus");
    expect(page.rows[0]!.listing).not.toHaveProperty("approvalStatus");

    const detail = normalizeStaffCatalogDetail(sticker);
    expect(detail?.shop.shopName).toBe("Metre Press");
    expect(detail?.listing.name).toBe("Die-cut sticker");
  });

  it("drops a row that arrives without a shop", () => {
    const page = normalizeStaffCatalogPage({
      items: [{ item: sticker.item }],
      total: 1,
    });
    expect(page.rows).toEqual([]);
  });

  it("turns peso filters into centavos and rejects a reversed range", () => {
    const ok = staffCatalogRequest({
      q: "sticker",
      subcategoryCode: "stickers",
      supplierId: "metre",
      minPesos: "20",
      maxPesos: "30.00",
    });
    expect(ok).toEqual({
      query: {
        limit: 50,
        q: "sticker",
        subcategoryCode: "stickers",
        supplierId: "metre",
        minPriceMinor: 2000,
        maxPriceMinor: 3000,
      },
    });

    const reversed = staffCatalogRequest({
      q: "",
      subcategoryCode: "",
      supplierId: "",
      minPesos: "80",
      maxPesos: "10",
    });
    expect(reversed).toEqual({
      error: "The lowest price has to sit at or below the highest.",
    });
  });
});
