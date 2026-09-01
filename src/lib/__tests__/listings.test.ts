import { describe, expect, it } from "vitest";

import {
  boardBlockers,
  boardCountLine,
  nextFreeSlot,
  normalizeListing,
  priceLine,
  unitChoiceLabel,
} from "@/lib/listings";

const listing = normalizeListing({
  id: "sci_1",
  supplierServiceId: "svc_1",
  subcategoryCode: "flyers",
  name: "Flyers",
  description: "Single-sheet colour printing.",
  basePriceMinor: 40000,
  pricingUnit: "per_package",
  packageQty: 100,
  turnaroundMode: "override",
  turnaroundHours: 48,
  fileFormatMode: "override",
  formatCodes: ["pdf", "jpeg"],
  active: true,
  photos: [{ fileId: "file_1", sortOrder: 0 }],
  optionGroups: [
    {
      id: "grp_1",
      name: "Size",
      kind: "spec",
      required: true,
      options: [
        { id: "opt_a", label: "A5", priceModifierMinor: 0, sortOrder: 0 },
        { id: "opt_b", label: "A4", priceModifierMinor: 1500, sortOrder: 1 },
      ],
    },
  ],
  version: 3,
});

describe("listings", () => {
  it("reads a catalog item as a listing on the board", () => {
    expect(listing?.name).toBe("Flyers");
    expect(listing?.onTheBoard).toBe(true);
    expect(listing?.photos).toHaveLength(1);
    expect(listing?.groups[0]?.options.map((option) => option.label)).toEqual(["A5", "A4"]);
  });

  it("quotes from the cheapest required choice", () => {
    expect(priceLine(listing!)).toBe("From ₱400.00 per pack of 100");
  });

  it("names the unit the way a shop says it", () => {
    expect(unitChoiceLabel("per_package")).toBe("Per pack");
    expect(unitChoiceLabel("per_unit")).toBe("Per piece");
  });

  it("asks for a sample photo before the listing can go up", () => {
    const blockers = boardBlockers(
      { ...listing!, photos: [] },
      { inheritedTurnaroundHours: 48, inheritedFormatCodes: ["pdf"] },
    );
    expect(blockers[0]).toMatch(/sample photo/i);
  });

  it("puts a new step in the first free slot after a gap", () => {
    expect(nextFreeSlot([0, 2], 6)).toBe(1);
  });

  it("counts listings in a spoken sentence", () => {
    expect(boardCountLine(0)).toBe("No listings yet");
    expect(boardCountLine(1)).toBe("1 listing");
    expect(boardCountLine(3)).toBe("3 listings");
  });
});
