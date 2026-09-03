import { describe, expect, it } from "vitest";

import {
  boardBlockers,
  boardCountLine,
  nextFreeSlot,
  normalizeListing,
  priceLine,
  printerCapLine,
  printerMaxWidthFeetWrite,
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

  it("reads printerMaxWidthFeet from the catalog item JSON field", () => {
    const tarp = normalizeListing({
      id: "sci_tarp",
      supplierServiceId: "svc_1",
      subcategoryCode: "tarpaulins_outdoor_banners",
      name: "Tarpaulin",
      description: "Outdoor vinyl.",
      basePriceMinor: 150000,
      pricingUnit: "per_area",
      measureUnit: "ft",
      printerMaxWidthFeet: 5,
      turnaroundMode: "override",
      turnaroundHours: 24,
      fileFormatMode: "override",
      formatCodes: ["pdf"],
      active: true,
      photos: [{ fileId: "file_1", sortOrder: 0 }],
      optionGroups: [],
    });
    expect(tarp?.printerMaxWidthFeet).toBe(5);
    expect(printerCapLine(tarp!.printerMaxWidthFeet)).toBe("Max printer width 5 feet");
    expect(tarp).not.toHaveProperty("printer_max_width_feet");
  });

  it("requires max printer width in feet before a tarpaulin listing can go on the board", () => {
    const ready = {
      inheritedTurnaroundHours: 24,
      inheritedFormatCodes: ["pdf"],
    };
    const tarp = {
      ...listing!,
      subcategoryCode: "tarpaulins_outdoor_banners",
      pricingUnit: "per_area" as const,
      packageQty: null,
      measureUnit: "ft" as const,
      printerMaxWidthFeet: null,
    };
    expect(boardBlockers(tarp, ready)).toContain(
      "Set the max printer width in feet before it can go on the board.",
    );
    expect(boardBlockers({ ...tarp, printerMaxWidthFeet: 5 }, ready).join(" ")).not.toMatch(
      /printer width/i,
    );
    expect(boardBlockers({ ...tarp, printerMaxWidthFeet: 99 }, ready)).toContain(
      "Max printer width must be a whole number of feet from 1 to 20.",
    );
  });

  it("does not require a printer cap on other listing families", () => {
    expect(listing?.printerMaxWidthFeet).toBeNull();
    expect(
      boardBlockers(listing!, {
        inheritedTurnaroundHours: 48,
        inheritedFormatCodes: ["pdf"],
      }),
    ).toEqual([]);
  });

  it("writes printerMaxWidthFeet only for tarpaulin, and never a stale number on other families", () => {
    expect(printerMaxWidthFeetWrite("tarpaulins_outdoor_banners", 7, "create")).toEqual({
      printerMaxWidthFeet: 7,
    });
    expect(printerMaxWidthFeetWrite("tarpaulins_outdoor_banners", 7, "update")).toEqual({
      printerMaxWidthFeet: 7,
    });
    expect(printerMaxWidthFeetWrite("flyers", 7, "create")).toEqual({});
    expect(printerMaxWidthFeetWrite("flyers", 7, "update")).toEqual({
      printerMaxWidthFeet: null,
    });
    expect(printerMaxWidthFeetWrite("tarpaulins_outdoor_banners", "", "update")).toEqual({
      printerMaxWidthFeet: null,
    });
    expect(Object.keys(printerMaxWidthFeetWrite("tarpaulins_outdoor_banners", 5))).toEqual([
      "printerMaxWidthFeet",
    ]);
  });
});
