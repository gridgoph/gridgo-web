import { describe, expect, it } from "vitest";

import {
  listingBoardState,
  listingCountLine,
  listingReviewState,
  takenDownLine,
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
      "Off the board",
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

  it("counts the listings the API found, and says when more remain", () => {
    expect(listingCountLine(40, 40, false)).toBe("40 listings");
    expect(listingCountLine(1, 1, false)).toBe("1 listing");
    expect(listingCountLine(3, 3, true)).toBe("3 listings match");
    expect(listingCountLine(1, 1, true)).toBe("1 listing matches");
    expect(listingCountLine(50, 120, false)).toBe("Showing 50 of 120 listings");
    expect(listingCountLine(50, 61, true)).toBe("Showing 50 of 61 listings that match");
  });

  it("says when a listing was taken down, and stays plain without the time", () => {
    expect(takenDownLine({ suspendedAt: "2026-10-04T07:12:00.000Z" })).toMatch(
      /^Taken down Oct 4, 2026/,
    );
    expect(takenDownLine({ suspendedAt: null })).toBe("Taken down");
  });
});

describe("listingReviewState", () => {
  it("names a pending new listing, a pending change and a send-back, and nothing once approved", () => {
    expect(listingReviewState({ reviewStatus: "pending", hasApprovedVersion: false })?.label).toBe("In review");
    expect(listingReviewState({ reviewStatus: "pending", hasApprovedVersion: true })?.label).toBe(
      "Change in review",
    );
    expect(listingReviewState({ reviewStatus: "needs_revision", hasApprovedVersion: false })?.label).toBe(
      "Sent back",
    );
    expect(listingReviewState({ reviewStatus: "approved", hasApprovedVersion: true })).toBeNull();
    expect(listingReviewState({ reviewStatus: null, hasApprovedVersion: null })).toBeNull();
  });
});
