import { describe, expect, it } from "vitest";

import {
  STANDING_OPTIONS,
  matchesStanding,
  standingCounts,
  toListQuery,
  DEFAULT_BOARD_QUERY,
} from "@/lib/catalogue-board";
import {
  CHANGES_IN_REVIEW_NOTE,
  LISTING_STANDING_LABEL,
  boardStanding,
  normalizeListing,
  normalizeListingReadiness,
  readinessSteps,
  type Listing,
  type ListingReadiness,
} from "@/lib/listings";

const context = { inheritedTurnaroundHours: 48, inheritedFormatCodes: ["pdf"] };

function listing(overrides: Record<string, unknown> = {}): Listing {
  const value = normalizeListing({
    id: "sci_1",
    supplierServiceId: "svc_1",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: "Single-sheet colour printing.",
    basePriceMinor: 40000,
    pricingUnit: "per_unit",
    turnaroundMode: "inherit",
    fileFormatMode: "inherit",
    active: true,
    reviewStatus: "approved",
    hasApprovedVersion: true,
    photos: [{ fileId: "file_1", sortOrder: 0 }],
    optionGroups: [
      {
        id: "grp_1",
        name: "Size",
        kind: "spec",
        required: true,
        options: [{ id: "opt_a", label: "A5", priceModifierMinor: 0, sortOrder: 0 }],
      },
    ],
    version: 3,
    ...overrides,
  });
  if (!value) throw new Error("fixture");
  return value;
}

const ready: ListingReadiness = { ready: true, missing: [] };
const notReady = (...codes: string[]): ListingReadiness => ({
  ready: false,
  missing: codes.map((code) => ({ code, message: `message:${code}`, action: null })),
});

describe("listing standing (gridgo-web#111)", () => {
  it("uses the supplier app's six names", () => {
    expect(Object.values(LISTING_STANDING_LABEL)).toEqual([
      "Live",
      "Pending review",
      "Needs changes",
      "Hidden by you",
      "Taken down by GRIDGO",
      "Not ready yet",
    ]);
    expect(STANDING_OPTIONS.map((option) => option.label)).toEqual([
      "All",
      "Live",
      "Pending review",
      "Needs changes",
      "Hidden by you",
      "Taken down by GRIDGO",
      "Not ready yet",
    ]);
  });

  it("reads Live when matching can use the listing", () => {
    expect(boardStanding(listing(), context, true, ready)).toMatchObject({
      kind: "live",
      label: "Live",
      tone: "success",
      note: null,
      secondary: null,
    });
  });

  it("reads Live without readiness for an approved, finished listing on an approved shop", () => {
    expect(boardStanding(listing(), context, true, null).kind).toBe("live");
  });

  it("keeps a live listing Live while its change is reviewed, and says so", () => {
    const standing = boardStanding(
      listing({ reviewStatus: "pending", hasApprovedVersion: true }),
      context,
      true,
      ready,
    );
    expect(standing).toMatchObject({
      kind: "live",
      secondary: "pending_review",
      note: CHANGES_IN_REVIEW_NOTE,
    });
  });

  it("keeps a live listing Live when its change is sent back, with the reason", () => {
    const standing = boardStanding(
      listing({
        reviewStatus: "needs_revision",
        reviewReason: "Check the price.",
        hasApprovedVersion: true,
      }),
      context,
      true,
      ready,
    );
    expect(standing).toMatchObject({
      kind: "live",
      secondary: "needs_changes",
      note: "Check the price.",
    });
    expect(matchesStanding(standing, "live")).toBe(true);
    expect(matchesStanding(standing, "needs_changes")).toBe(true);
    expect(matchesStanding(standing, "pending_review")).toBe(false);
    expect(standingCounts([standing])).toMatchObject({
      all: 1,
      live: 1,
      needs_changes: 1,
    });
  });

  it("reads Pending review for a new listing Operations has not approved", () => {
    const standing = boardStanding(
      listing({ reviewStatus: "pending", hasApprovedVersion: false }),
      context,
      true,
      notReady("listing_not_approved"),
    );
    expect(standing).toMatchObject({ kind: "pending_review", label: "Pending review" });
  });

  it("reads Pending review for a submitted listing the board's checklist still finds a gap in", () => {
    const standing = boardStanding(
      listing({ reviewStatus: "pending", hasApprovedVersion: false, description: "" }),
      context,
      true,
      notReady("listing_not_approved"),
    );
    expect(standing).toMatchObject({
      kind: "pending_review",
      label: "Pending review",
      note: "Operations checks every new listing before clients see it.",
    });
    expect(standing.steps).toEqual([
      "Say what this is, so a client knows what they are ordering.",
    ]);
    expect(standingCounts([standing])).toMatchObject({ pending_review: 1, not_ready: 0 });
  });

  it("reads Needs changes with Operations' reason, before anything else but a take-down", () => {
    const standing = boardStanding(
      listing({
        reviewStatus: "needs_revision",
        reviewReason: "Remove the logo from photo 2.",
        active: false,
      }),
      context,
      true,
      notReady("listing_not_approved", "item_inactive"),
    );
    expect(standing).toMatchObject({
      kind: "needs_changes",
      label: "Needs changes",
      note: "Remove the logo from photo 2.",
    });
  });

  it("reads Hidden by you when the shop's own switch is off", () => {
    const standing = boardStanding(
      listing({ active: false }),
      context,
      true,
      notReady("item_inactive"),
    );
    expect(standing).toMatchObject({ kind: "hidden", label: "Hidden by you" });
  });

  it("reads Taken down by GRIDGO with the reason, over every other state", () => {
    const standing = boardStanding(
      listing({
        active: false,
        suspendReason: "Blurry sample",
        reviewStatus: "needs_revision",
      }),
      context,
      true,
      notReady("item_inactive"),
    );
    expect(standing).toMatchObject({
      kind: "taken_down",
      label: "Taken down by GRIDGO",
      note: "Blurry sample",
    });
  });

  it("reads Not ready yet with the listing's own missing step first", () => {
    const standing = boardStanding(
      listing(),
      context,
      true,
      notReady("supplier_not_approved", "service_not_live"),
    );
    expect(standing.kind).toBe("not_ready");
    expect(standing.note).toBe("message:service_not_live");
    expect(standing.steps).toEqual([
      "message:service_not_live",
      "message:supplier_not_approved",
    ]);
  });

  it("reads Not ready yet from the board's checklist when the listing is unfinished", () => {
    const standing = boardStanding(listing({ photos: [] }), context, true, null);
    expect(standing.kind).toBe("not_ready");
    expect(standing.note).toMatch(/sample photo/i);
  });

  it("asks for a spec a client picks from", () => {
    const standing = boardStanding(listing({ optionGroups: [] }), context, true, null);
    expect(standing.kind).toBe("not_ready");
    expect(standing.note).toMatch(/spec a client picks from/i);
  });

  it("says a shop awaiting approval is Not ready yet when readiness is unavailable", () => {
    const standing = boardStanding(listing(), context, false, null);
    expect(standing.kind).toBe("not_ready");
    expect(standing.note).toMatch(/Operations approval/);
  });

  it("never lists a step the chip already says", () => {
    expect(
      readinessSteps(notReady("item_inactive", "listing_not_approved", "photo")),
    ).toEqual(["message:photo"]);
  });

  it("reads operational listings from the readiness API", () => {
    const map = normalizeListingReadiness({
      readyForApproval: false,
      missing: ["shop_identity_image"],
      operational: {
        ready: false,
        missing: [
          {
            code: "no_matchable_listing",
            message: "No listing.",
            action: "edit_listings",
          },
        ],
        listings: [
          { catalogItemId: "sci_1", ready: true, missing: [] },
          {
            catalogItemId: "sci_2",
            ready: false,
            missing: [
              {
                code: "photo",
                message: "Attach a photo.",
                action: "upload_listing_photo",
              },
              "legacy",
            ],
          },
          { ready: true },
        ],
      },
    });
    expect([...map.keys()]).toEqual(["sci_1", "sci_2"]);
    expect(map.get("sci_1")).toEqual({ ready: true, missing: [] });
    expect(map.get("sci_2")?.missing).toEqual([
      { code: "photo", message: "Attach a photo.", action: "upload_listing_photo" },
      { code: "legacy", message: "legacy", action: null },
    ]);
    expect(normalizeListingReadiness({ readyForApproval: true }).size).toBe(0);
  });

  it("reads the review fields, and leaves them null on an API without review", () => {
    const reviewed = listing({
      reviewStatus: "needs_revision",
      reviewReason: " Fix it ",
      reviewedAt: "2026-10-05T01:00:00Z",
      supplierId: "usr_1",
    });
    expect(reviewed).toMatchObject({
      reviewStatus: "needs_revision",
      reviewReason: "Fix it",
      reviewedAt: "2026-10-05T01:00:00Z",
      hasApprovedVersion: true,
      supplierId: "usr_1",
    });
    const older = normalizeListing({ id: "sci_9", name: "Old" });
    expect(older).toMatchObject({
      reviewStatus: null,
      hasApprovedVersion: null,
      supplierId: null,
    });
  });

  it("counts and filters the board by standing, never sending it to the API", () => {
    const standings = [
      boardStanding(listing(), context, true, ready),
      boardStanding(listing({ active: false }), context, true, notReady("item_inactive")),
      boardStanding(listing({ active: false }), context, true, notReady("item_inactive")),
    ];
    const counts = standingCounts(standings);
    expect(counts).toMatchObject({
      all: 3,
      live: 1,
      hidden: 2,
      pending_review: 0,
      not_ready: 0,
    });
    expect(
      standings.filter((standing) => matchesStanding(standing, "hidden")),
    ).toHaveLength(2);
    expect(standings.filter((standing) => matchesStanding(standing, "all"))).toHaveLength(
      3,
    );
    expect(
      toListQuery({ ...DEFAULT_BOARD_QUERY, standing: "hidden" }),
    ).not.toHaveProperty("active");
  });
});
