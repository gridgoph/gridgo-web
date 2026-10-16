import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  FEATURED_PRINTS_MAX,
  approvedSpecLine,
  clientPriceLine,
  clientUnitLine,
  featuredPrintsErrorMessage,
  moveEntry,
  normalizeFeaturedPrints,
  readFeaturedCard,
  saveBlocker,
  unavailableIdsFrom,
  type FeaturedEntry,
} from "@/lib/featured-prints";

const flyerCard = {
  id: "sci_flyer",
  name: "Flyers",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  clientFromPriceMinor: 1100,
  pricingUnit: "per_unit",
  packageQty: null,
  measureUnit: null,
  minimumOrderQuantity: null,
  photos: [
    {
      fileId: "file_b",
      sortOrder: 1,
      url: "/catalog/media/file_b",
      downloadUrl: "https://storage.example/b",
    },
    {
      fileId: "file_a",
      sortOrder: 0,
      url: "/catalog/media/file_a",
      downloadUrl: "https://storage.example/a",
      downloadUrlExpiresAt: "2026-10-15T00:05:00.000Z",
    },
  ],
};

describe("normalizeFeaturedPrints", () => {
  it("keeps the stored order and the IDs of products no longer available", () => {
    const result = normalizeFeaturedPrints({
      version: 4,
      catalogItemIds: ["sci_gone", "sci_flyer"],
      items: [
        { catalogItemId: "sci_gone", available: false, item: null },
        { catalogItemId: "sci_flyer", available: true, item: flyerCard },
      ],
    });
    expect(result.version).toBe(4);
    expect(result.entries.map((entry) => entry.catalogItemId)).toEqual(["sci_gone", "sci_flyer"]);
    expect(result.entries[0].card).toBeNull();
    expect(result.entries[1].card?.name).toBe("Flyers");
  });

  it("reads an unset setting as version 1 with nothing featured", () => {
    expect(normalizeFeaturedPrints({})).toEqual({ version: 1, entries: [] });
    expect(normalizeFeaturedPrints(null)).toEqual({ version: 1, entries: [] });
  });

  it("still lists a stored ID the rows left out, so it can be removed", () => {
    const result = normalizeFeaturedPrints({
      version: 2,
      catalogItemIds: ["sci_flyer", "sci_missing"],
      items: [{ catalogItemId: "sci_flyer", available: true, item: flyerCard }],
    });
    expect(result.entries[1]).toEqual({ catalogItemId: "sci_missing", card: null });
  });
});

describe("readFeaturedCard", () => {
  it("takes the first photo by sortOrder and its signed link", () => {
    const card = readFeaturedCard(flyerCard);
    expect(card?.photo).toEqual({
      fileId: "file_a",
      downloadUrl: "https://storage.example/a",
      downloadUrlExpiresAt: "2026-10-15T00:05:00.000Z",
    });
  });

  it("keeps only the anonymous fields of an approved catalogue item", () => {
    const card = readFeaturedCard({
      item: {
        ...flyerCard,
        supplierId: "user_shop",
        supplierServiceId: "svc_shop",
        shopName: "Shop A",
        fromPriceMinor: 1000,
        basePriceMinor: 1000,
        rating: { average: 5 },
        description: "Printed by Shop A",
      },
    });
    expect(card).not.toBeNull();
    const serialized = JSON.stringify(card);
    for (const leak of ["user_shop", "svc_shop", "Shop A", "fromPriceMinor", "rating"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(card?.clientFromPriceMinor).toBe(1100);
  });

  it("refuses a product without GRIDGO's starting price", () => {
    expect(readFeaturedCard({ ...flyerCard, clientFromPriceMinor: null })).toBeNull();
  });

  it("has no photo while signing is unavailable", () => {
    const card = readFeaturedCard({
      ...flyerCard,
      photos: [{ fileId: "file_a", sortOrder: 0, url: "/catalog/media/file_a" }],
    });
    expect(card?.photo?.downloadUrl).toBeNull();
  });
});

describe("client price and unit words", () => {
  it("matches the client app's unit line", () => {
    const base = { packageQty: null, measureUnit: null };
    expect(clientUnitLine({ ...base, pricingUnit: "per_unit" })).toBe("each");
    expect(clientUnitLine({ ...base, pricingUnit: "per_package", packageQty: 100 })).toBe(
      "per pack of 100",
    );
    expect(clientUnitLine({ ...base, pricingUnit: "per_area", measureUnit: "ft" })).toBe(
      "per sq ft",
    );
    expect(clientUnitLine({ ...base, pricingUnit: "per_length", measureUnit: "m" })).toBe(
      "per metre",
    );
    expect(clientUnitLine({ ...base, pricingUnit: "whole_job" })).toBe("for the job");
    expect(clientUnitLine({ ...base, pricingUnit: "per_page" })).toBe("per page");
  });

  it("shows the fee-inclusive figure as sent, never adding a fee", () => {
    expect(clientPriceLine({ clientFromPriceMinor: 1100 })).toBe("From ₱11.00");
  });
});

describe("moveEntry", () => {
  it("moves within the row and stops at its ends", () => {
    expect(moveEntry(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveEntry(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveEntry(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("saveBlocker", () => {
  const card = readFeaturedCard(flyerCard);
  const ok: FeaturedEntry = { catalogItemId: "sci_flyer", card };

  it("needs a reason of 1 to 2,000 characters", () => {
    const none = new Set<string>();
    expect(saveBlocker({ entries: [ok], unavailableIds: none, reason: "   " })).toMatch(/why/);
    expect(saveBlocker({ entries: [ok], unavailableIds: none, reason: "x".repeat(2001) })).toMatch(
      /2,000/,
    );
    expect(saveBlocker({ entries: [ok], unavailableIds: none, reason: "New season" })).toBeNull();
    expect(saveBlocker({ entries: [], unavailableIds: none, reason: "Clear the row" })).toBeNull();
  });

  it("asks to remove products the API will refuse", () => {
    expect(
      saveBlocker({
        entries: [ok, { catalogItemId: "sci_gone", card: null }],
        unavailableIds: new Set(),
        reason: "Refresh",
      }),
    ).toMatch(/Remove the product/);
    expect(
      saveBlocker({ entries: [ok], unavailableIds: new Set(["sci_flyer"]), reason: "Refresh" }),
    ).toMatch(/Remove the product/);
  });

  it("caps the row at the API's limit", () => {
    const entries = Array.from({ length: FEATURED_PRINTS_MAX + 1 }, (_, index) => ({
      catalogItemId: `sci_${index}`,
      card,
    }));
    expect(saveBlocker({ entries, unavailableIds: new Set(), reason: "Too many" })).toMatch(/20/);
  });
});

describe("errors", () => {
  it("reads the refused IDs from featured_prints_item_unavailable", () => {
    const err = new ApiError(409, {
      error: "featured_prints_item_unavailable",
      catalogItemIds: ["sci_gone"],
    });
    expect(unavailableIdsFrom(err)).toEqual(["sci_gone"]);
    expect(unavailableIdsFrom(new Error("x"))).toEqual([]);
  });

  it("explains each contract error in plain words", () => {
    const message = (status: number, error: string) =>
      featuredPrintsErrorMessage(new ApiError(status, { error }), "fallback");
    expect(message(409, "featured_prints_version_conflict")).toMatch(/Someone else saved/);
    expect(message(400, "featured_prints_reason_required")).toMatch(/why/);
    expect(message(400, "invalid_featured_prints")).toMatch(/20/);
    expect(message(403, "forbidden")).toMatch(/Operations and Super Admin/);
    expect(featuredPrintsErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});

describe("approvedSpecLine", () => {
  it("names a few spec choices and counts the rest", () => {
    const line = approvedSpecLine({
      item: {
        optionGroups: [
          { kind: "spec", options: [{ label: "A5" }, { label: "A4" }, { label: "A3" }] },
          { kind: "addon", options: [{ label: "Rush" }] },
          { kind: "spec", options: [{ label: "Matte" }, { label: "Glossy" }] },
        ],
      },
    });
    expect(line).toBe("A5, A4, A3, Matte and 1 more");
  });
});
