import { describe, expect, it } from "vitest";

import {
  confirmationMatches,
  describeDeleteRefusal,
  usageLines,
} from "@/app/admin/catalogue/_lib/danger";
import { ApiError } from "@/lib/api/client";

describe("confirmationMatches", () => {
  it("accepts only the exact code, trimmed", () => {
    expect(confirmationMatches("flyers", "flyers")).toBe(true);
    expect(confirmationMatches("  flyers ", "flyers")).toBe(true);
    expect(confirmationMatches("Flyers", "flyers")).toBe(false);
    expect(confirmationMatches("flyer", "flyers")).toBe(false);
    expect(confirmationMatches("", "")).toBe(false);
  });
});

describe("usageLines", () => {
  it("names shops, counts orders, and leaves zero figures out", () => {
    expect(
      usageLines(
        {
          listings: 3,
          shops: [
            { supplierId: "a", shopName: "Printlab Davao" },
            { supplierId: "b", shopName: "Lovis Printshop" },
          ],
          orders: 2,
          starters: 0,
        },
        "print job",
      ),
    ).toEqual([
      "3 listings are filed against it from 2 shops: Printlab Davao, Lovis Printshop.",
      "2 orders were placed against those listings.",
    ]);
  });

  it("reads a category's print jobs, accreditations and legacy codes first", () => {
    expect(
      usageLines(
        {
          printJobs: 1,
          services: 2,
          aliases: 1,
          listings: 1,
          shops: [{ supplierId: "a", shopName: "Printlab Davao" }],
          orders: 0,
          starters: 1,
        },
        "category",
      ),
    ).toEqual([
      "1 print job still sits under it. Move or delete each one first.",
      "2 shops are accredited here.",
      "1 listing is filed against its print jobs from 1 shop: Printlab Davao.",
      "1 GRIDGO starter is seeded for it.",
      "1 legacy code still points here.",
    ]);
  });

  it("caps the shop list at three names", () => {
    const shops = ["A", "B", "C", "D", "E"].map((shopName) => ({
      supplierId: shopName,
      shopName,
    }));
    expect(
      usageLines({ listings: 5, shops, orders: 0, starters: 0 }, "print job"),
    ).toEqual(["5 listings are filed against it from 5 shops: A, B, C and 2 more."]);
  });
});

describe("describeDeleteRefusal", () => {
  it("only explains the two expected 409s", () => {
    expect(
      describeDeleteRefusal(new ApiError(409, { error: "code_exists" }), "category"),
    ).toBeNull();
    expect(
      describeDeleteRefusal(new ApiError(403, { error: "forbidden" }), "category"),
    ).toBeNull();
    expect(describeDeleteRefusal(new TypeError("offline"), "category")).toBeNull();
  });

  it("offers retire only while the entry is still shown", () => {
    const shown = describeDeleteRefusal(
      new ApiError(409, { error: "catalog_entry_shipped", canRetire: true }),
      "print job",
    );
    expect(shown?.reason).toBe("shipped");
    expect(shown?.canRetire).toBe(true);
    expect(shown?.lines.at(-1)).toMatch(/^Hide it from new listings instead/);

    const hidden = describeDeleteRefusal(
      new ApiError(409, {
        error: "catalog_entry_in_use",
        canRetire: false,
        usage: { listings: 1, shops: [], orders: 0, starters: 0 },
      }),
      "print job",
    );
    expect(hidden?.reason).toBe("in_use");
    expect(hidden?.canRetire).toBe(false);
    expect(hidden?.lines).toEqual([
      "1 listing is filed against it.",
      "It is already hidden from new listings.",
    ]);
  });
});
