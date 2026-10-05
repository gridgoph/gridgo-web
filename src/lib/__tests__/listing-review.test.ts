import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  PHOTO_RULE_CHECKS,
  approveBlocker,
  blockerSentence,
  filterReviewEntries,
  listingChanges,
  normalizeProductTypeRequests,
  normalizeReviewPage,
  oldestFirst,
  productTypeCodeError,
  reviewChip,
  reviewErrorMessage,
  suggestProductTypeCode,
} from "@/lib/listing-review";
import { normalizeListing } from "@/lib/listings";

const item = (overrides: Record<string, unknown> = {}) => ({
  id: "sci_1",
  supplierId: "usr_shop_a",
  supplierServiceId: "svc_1",
  subcategoryCode: "flyers",
  name: "Glossy flyers",
  basePriceMinor: 40000,
  pricingUnit: "per_unit",
  reviewStatus: "pending",
  hasApprovedVersion: false,
  version: 4,
  updatedAt: "2026-10-05T02:00:00Z",
  photos: [{ fileId: "f1", sortOrder: 0, downloadUrl: "https://files.example/f1" }],
  optionGroups: [
    {
      id: "grp_size",
      name: "Size",
      kind: "spec",
      required: true,
      options: [
        { id: "a5", label: "A5", priceModifierMinor: 0, active: true },
        { id: "a4", label: "A4", priceModifierMinor: 1500, active: true },
      ],
    },
  ],
  ...overrides,
});

const all = new Set(PHOTO_RULE_CHECKS.map((check) => check.id));

describe("listing review queue", () => {
  it("reads the queue page with each listing's blockers and cursor", () => {
    const page = normalizeReviewPage({
      items: [
        item(),
        { ...item({ id: "sci_2" }), reviewBlockers: ["photo", "specs_required"] },
        { junk: true },
      ],
      nextCursor: "sci_2",
    });
    expect(page.entries.map((entry) => entry.listing.id)).toEqual(["sci_1", "sci_2"]);
    expect(page.entries[0].blockers).toEqual([]);
    expect(page.entries[1].blockers).toEqual(["photo", "specs_required"]);
    expect(page.entries[0].listing.photos[0].downloadUrl).toBe(
      "https://files.example/f1",
    );
    expect(page.nextCursor).toBe("sci_2");
  });

  it("explains blockers in plain words, naming an empty option group", () => {
    const listing = normalizeListing(item())!;
    expect(blockerSentence("specs_required")).toMatch(/spec a client picks from/);
    expect(blockerSentence("option_group:grp_size", listing)).toBe(
      "“Size” has no active choice.",
    );
    expect(blockerSentence("option_group:missing", listing)).toMatch(/spec or add-on/);
    expect(blockerSentence("something_new")).toMatch(/still missing/);
  });

  it("approves only a finished, pending listing once every photo check is ticked", () => {
    const entry = { listing: normalizeListing(item())!, blockers: [] };
    expect(approveBlocker(entry, new Set())).toMatch(/Tick every photo check/);
    expect(approveBlocker(entry, new Set(["watermark", "logo"]))).toMatch(
      /Tick every photo check/,
    );
    expect(approveBlocker(entry, all)).toBeNull();
    expect(approveBlocker({ ...entry, blockers: ["photo"] }, all)).toMatch(
      /finish this listing/,
    );
    const decided = {
      listing: normalizeListing(item({ reviewStatus: "approved" }))!,
      blockers: [],
    };
    expect(approveBlocker(decided, all)).toMatch(/waiting for review/);
  });

  it("names the rule's three checks", () => {
    expect(PHOTO_RULE_CHECKS.map((check) => check.label)).toEqual([
      "No watermark",
      "No logo",
      "No shop branding",
    ]);
  });

  it("filters by search, kind, shop and product type, and sorts oldest first", () => {
    const entries = normalizeReviewPage({
      items: [
        item({ id: "new", updatedAt: "2026-10-05T03:00:00Z" }),
        item({
          id: "change",
          hasApprovedVersion: true,
          supplierId: "usr_shop_b",
          subcategoryCode: "stickers",
          name: "Die-cut stickers",
          updatedAt: "2026-10-04T03:00:00Z",
        }),
      ],
    }).entries;
    const shop = (id: string | null) => (id === "usr_shop_b" ? "Shop B" : "Shop A");
    const type = (code: string) => (code === "stickers" ? "Stickers" : "Flyers");
    const base = { q: "", kind: "all" as const, supplierId: "", subcategoryCode: "" };
    expect(
      filterReviewEntries(entries, { ...base, kind: "revision" }, shop, type).map(
        (e) => e.listing.id,
      ),
    ).toEqual(["change"]);
    expect(
      filterReviewEntries(entries, { ...base, kind: "new" }, shop, type).map(
        (e) => e.listing.id,
      ),
    ).toEqual(["new"]);
    expect(
      filterReviewEntries(entries, { ...base, q: "shop b" }, shop, type).map(
        (e) => e.listing.id,
      ),
    ).toEqual(["change"]);
    expect(
      filterReviewEntries(entries, { ...base, q: "flyers" }, shop, type).map(
        (e) => e.listing.id,
      ),
    ).toEqual(["new"]);
    expect(
      filterReviewEntries(entries, { ...base, supplierId: "usr_shop_a" }, shop, type),
    ).toHaveLength(1);
    expect(
      filterReviewEntries(entries, { ...base, subcategoryCode: "stickers" }, shop, type),
    ).toHaveLength(1);
    expect(oldestFirst(entries).map((e) => e.listing.id)).toEqual(["change", "new"]);
  });

  it("chips an unfinished listing apart from one ready to review", () => {
    const listing = normalizeListing(item())!;
    expect(reviewChip({ listing, blockers: [] }).label).toBe("Ready to review");
    expect(reviewChip({ listing, blockers: ["photo"] }).label).toBe("Not finished");
    expect(
      reviewChip({
        listing: normalizeListing(item({ reviewStatus: "needs_revision" }))!,
        blockers: [],
      }).label,
    ).toBe("Sent back");
  });

  it("shows what a change does to the version clients see", () => {
    const live = normalizeListing(item({ hasApprovedVersion: true }))!;
    const draft = normalizeListing(
      item({
        basePriceMinor: 45000,
        photos: [{ fileId: "f2", sortOrder: 0 }],
        optionGroups: [
          {
            id: "grp_size",
            name: "Size",
            kind: "spec",
            required: true,
            options: [{ id: "a5", label: "A5", priceModifierMinor: 0, active: true }],
          },
        ],
      }),
    )!;
    const changes = listingChanges(live, draft);
    expect(changes.map((change) => change.label)).toEqual(["Price", "Size", "Photos"]);
    expect(changes[0]).toEqual({
      label: "Price",
      before: "From ₱400.00 per piece",
      after: "₱450.00 per piece",
    });
    expect(changes[1].before).toBe("A5, A4 (+₱15.00)");
    expect(changes[2]).toEqual({
      label: "Photos",
      before: "1 photo",
      after: "1 new, 1 removed",
    });
    expect(listingChanges(live, live)).toEqual([]);
  });
});

describe("product-type requests", () => {
  it("reads requests and drops malformed rows", () => {
    const { requests, nextCursor } = normalizeProductTypeRequests({
      requests: [
        {
          id: "ptr_1",
          supplierId: "usr_shop_a",
          categoryCode: "labels",
          name: "Holographic stickers",
          description: "Rainbow foil.",
          status: "pending",
          version: 1,
          createdAt: "2026-10-05T00:00:00Z",
        },
        { id: "ptr_2", name: "Bad", status: "weird" },
        { name: "No id", status: "pending" },
      ],
      nextCursor: null,
    });
    expect(requests.map((request) => request.id)).toEqual(["ptr_1"]);
    expect(requests[0]).toMatchObject({
      categoryCode: "labels",
      version: 1,
      reason: null,
    });
    expect(nextCursor).toBeNull();
  });

  it("suggests a code the API accepts and checks the one typed", () => {
    expect(suggestProductTypeCode("Holographic Stickers (die-cut)")).toBe(
      "holographic_stickers_die_cut",
    );
    expect(suggestProductTypeCode("3D Prints")).toBe("d_prints");
    expect(suggestProductTypeCode("Café menus")).toBe("cafe_menus");
    const existing = new Set(["flyers"]);
    expect(productTypeCodeError("", existing)).toMatch(/Enter a code/);
    expect(productTypeCodeError("Flyers", existing)).toMatch(/lowercase/);
    expect(productTypeCodeError("1flyers", existing)).toMatch(/starting with a letter/);
    expect(productTypeCodeError("flyers", existing)).toMatch(/already uses/);
    expect(productTypeCodeError("a".repeat(101), existing)).toMatch(/100 characters/);
    expect(productTypeCodeError("holo_stickers", existing)).toBeNull();
  });
});

describe("review errors", () => {
  it("explains the API's review refusals by code", () => {
    const error = (code: string, status = 409) => new ApiError(status, { error: code });
    expect(reviewErrorMessage(error("listing_not_pending"))).toMatch(/already decided/);
    expect(reviewErrorMessage(error("catalog_item_stale"))).toMatch(
      /changed this listing/,
    );
    expect(reviewErrorMessage(error("listing_incomplete"))).toMatch(/not finished/);
    expect(reviewErrorMessage(error("photo_review_required", 400))).toMatch(
      /photo check/,
    );
    expect(reviewErrorMessage(error("product_type_exists"))).toMatch(
      /already uses that code/,
    );
    expect(reviewErrorMessage(error("forbidden", 403))).toBeNull();
  });
});
