import { describe, expect, it } from "vitest";

import {
  EMPTY_MORE,
  PRICE_REQUIRED,
  checkProductsLine,
  draftRows,
  expectedVersionsOf,
  fromPriceLine,
  groupLabel,
  isOpenOrderSkip,
  machinesLine,
  migrationManualLine,
  moreOptionsBlocker,
  moreOptionsBody,
  moreOptionsCount,
  moreOptionsFrom,
  normalizeCatalogue,
  normalizeMigrationPlan,
  normalizeSetupRequests,
  normalizeTemplate,
  outsideUsualRange,
  priceBlocker,
  priceCheckTargetLine,
  priceErrors,
  priceRowsFromItem,
  pricesBody,
  readTemplateFacts,
  readyByLine,
  readyChipLabel,
  rowsMatching,
  serviceFor,
  setupRequestStatus,
  stockPhotoSrc,
  templatePhotoUrl,
  templateStanding,
  type DraftRow,
} from "@/lib/product-templates";

const RAW_TEMPLATE = {
  id: "tpl_flyers",
  version: 2,
  active: true,
  name: "Flyers",
  description: "Flyers made to your selected specifications.",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  group: "marketing",
  unit: "piece",
  options: [
    { key: "standard", label: "A5 / Gloss", specBinding: null },
    {
      key: "variant_1",
      label: "A4 / Gloss",
      specBinding: { fieldCode: "size", valueCode: "a4" },
    },
    { key: "variant_2", label: "A4 / Matte" },
    { key: "", label: "dropped" },
  ],
  optionLists: [
    { name: "Size", options: ["A5", "A4"] },
    { name: "Finish", options: ["Gloss", "Matte"] },
  ],
  fileTypes: ["pdf"],
  clientTips: ["Send a print-ready file."],
  express: false,
  machinesNeeded: ["document_printer"],
  stockPhotos: [{ url: "/product-template-photos/lst_flyers.jpg", altText: "Flyers" }],
  priceRange: { minMinor: 500, maxMinor: 5000 },
  addedItemIds: ["sci_1"],
  machineMatch: null,
};

describe("reading templates", () => {
  it("keeps the options, lists and photo, and drops rows without a key", () => {
    const t = normalizeTemplate(RAW_TEMPLATE)!;
    expect(t.options.map((o) => o.key)).toEqual(["standard", "variant_1", "variant_2"]);
    expect(t.options[1]!.specBinding).toEqual({ fieldCode: "size", valueCode: "a4" });
    expect(t.photoUrl).toMatch(/\/product-template-photos\/lst_flyers\.jpg$/);
    expect(t.priceRange).toEqual({ minMinor: 500, maxMinor: 5000 });
    expect(t.addedItemIds).toEqual(["sci_1"]);
    expect(t.version).toBe(2);
  });

  it("refuses a template with no options", () => {
    expect(normalizeTemplate({ ...RAW_TEMPLATE, options: [] })).toBeNull();
  });

  it("reads the catalogue and counts suggested tidy-ups", () => {
    const c = normalizeCatalogue({
      templates: [RAW_TEMPLATE],
      readyTimes: [{ code: "same_day", label: "Same day" }],
      checkYourProducts: { actions: [{}, {}], unpricedItemIds: ["sci_9"] },
    });
    expect(c.templates).toHaveLength(1);
    expect(c.readyTimes).toEqual([{ code: "same_day", label: "Same day" }]);
    expect(c.check).toEqual({ unpricedItemIds: ["sci_9"], suggestedCount: 2 });
  });

  it("only joins photo paths, never protocol-relative or other schemes", () => {
    expect(templatePhotoUrl("https://x.test/a.jpg")).toBe("https://x.test/a.jpg");
    expect(templatePhotoUrl("//evil.test/a.jpg")).toBeNull();
    expect(templatePhotoUrl("javascript:alert(1)")).toBeNull();
    expect(templatePhotoUrl("/product-template-photos/a.jpg")).toMatch(
      /\/product-template-photos\/a\.jpg$/,
    );
  });

  it("finds an item's stock photo when it has no photo of its own", () => {
    expect(
      stockPhotoSrc({
        photos: [{ url: "/product-template-photos/b.jpg", realPhoto: false }],
      }),
    ).toMatch(/b\.jpg$/);
    expect(stockPhotoSrc({ photos: [{ fileId: "f1" }] })).toBeNull();
  });

  it("names groups and machines in words", () => {
    expect(groupLabel("recognition")).toBe("Awards");
    expect(groupLabel("new_group")).toBe("New group");
    expect(machinesLine({ machinesNeeded: ["large_format_printer"] })).toBe(
      "Needs a large-format printer",
    );
  });
});

describe("the price table", () => {
  const t = normalizeTemplate(RAW_TEMPLATE)!;

  it("starts empty, but ticks a one-option template for the shop", () => {
    expect(draftRows(t).every((r) => !r.on)).toBe(true);
    const single = { options: [t.options[0]!] };
    expect(draftRows(single)[0]!.on).toBe(true);
  });

  it("fills a saved table at full prices", () => {
    const rows = draftRows(t, [{ optionKey: "variant_1", priceMinor: 1250 }]);
    expect(rows.find((r) => r.optionKey === "variant_1")).toEqual({
      optionKey: "variant_1",
      on: true,
      price: "12.50",
    });
  });

  it("blocks an empty or ₱0 ticked price, and says how many", () => {
    const rows: DraftRow[] = [
      { optionKey: "standard", on: true, price: "" },
      { optionKey: "variant_1", on: true, price: "0" },
      { optionKey: "variant_2", on: false, price: "" },
    ];
    expect(priceErrors(rows)).toEqual({
      standard: PRICE_REQUIRED,
      variant_1: PRICE_REQUIRED,
    });
    expect(priceBlocker(rows)).toBe("2 ticked options need a price above ₱0.");
    expect(priceBlocker(rows.map((r) => ({ ...r, on: false })))).toBe(
      "Tick at least one option you make.",
    );
  });

  it("sends only ticked rows at full prices, and shows the lowest", () => {
    const rows: DraftRow[] = [
      { optionKey: "standard", on: true, price: "15" },
      { optionKey: "variant_1", on: true, price: "12.50" },
      { optionKey: "variant_2", on: false, price: "99" },
    ];
    expect(priceBlocker(rows)).toBeNull();
    expect(pricesBody(rows)).toEqual([
      { optionKey: "standard", priceMinor: 1500 },
      { optionKey: "variant_1", priceMinor: 1250 },
    ]);
    expect(fromPriceLine(rows, "piece")).toBe("From ₱12.50 per piece");
  });

  it("hints, never blocks, a price outside the usual range", () => {
    expect(outsideUsualRange(t, { optionKey: "standard", on: true, price: "100" })).toBe(
      true,
    );
    expect(outsideUsualRange(t, { optionKey: "standard", on: true, price: "10" })).toBe(
      false,
    );
    expect(outsideUsualRange(t, { optionKey: "standard", on: false, price: "100" })).toBe(
      false,
    );
  });

  it("filters rows by chosen option-list values", () => {
    expect([...rowsMatching(t, ["A4"])]).toEqual(["variant_1", "variant_2"]);
    expect([...rowsMatching(t, ["A4", "Matte"])]).toEqual(["variant_2"]);
    expect(rowsMatching(t, []).size).toBe(3);
  });

  it("rebuilds full prices from a staff item read", () => {
    expect(
      priceRowsFromItem({
        item: {
          basePriceMinor: 1000,
          template: { optionKeys: { o1: "standard", o2: "variant_1" } },
          optionGroups: [
            {
              options: [
                { id: "o1", priceModifierMinor: 0 },
                { id: "o2", priceModifierMinor: 250 },
                { id: "o3", priceModifierMinor: 50, active: false },
              ],
            },
          ],
        },
      }),
    ).toEqual([
      { optionKey: "standard", priceMinor: 1000 },
      { optionKey: "variant_1", priceMinor: 1250 },
    ]);
  });
});

describe("more options", () => {
  it("says what to fix when half-filled", () => {
    expect(moreOptionsBlocker({ ...EMPTY_MORE, bulkFrom: "10" })).toMatch(/price each/);
    expect(moreOptionsBlocker({ ...EMPTY_MORE, bulkFrom: "1", bulkPrice: "5" })).toMatch(
      /2 or more/,
    );
    expect(moreOptionsBlocker({ ...EMPTY_MORE, rushHours: "30", rushFee: "50" })).toMatch(
      /1 to 24/,
    );
    expect(moreOptionsBlocker({ ...EMPTY_MORE, minimumOrder: "1.5" })).toMatch(
      /whole number/,
    );
    expect(moreOptionsBlocker(EMPTY_MORE)).toBeNull();
  });

  it("builds the body, clearing bulk and rush when empty", () => {
    expect(moreOptionsBody(EMPTY_MORE)).toEqual({
      minimumOrderQuantity: null,
      priceTiers: [],
      speedTiers: [],
    });
    const more = {
      minimumOrder: "10",
      bulkFrom: "100",
      bulkPrice: "8",
      rushHours: "3",
      rushFee: "50",
      tips: " Send PDF ",
    };
    expect(moreOptionsBody(more)).toEqual({
      minimumOrderQuantity: 10,
      priceTiers: [{ minQuantity: 100, unitPriceMinor: 800 }],
      speedTiers: [
        { label: "Rush", turnaroundMinutes: 180, priceMinor: null, surchargeMinor: 5000 },
      ],
      clientTips: "Send PDF",
    });
    expect(moreOptionsCount(more)).toBe(4);
  });

  it("reads saved options back, leaving GRIDGO's own tips out", () => {
    expect(
      moreOptionsFrom({
        minimumOrderQuantity: 5,
        priceTiers: [{ minQuantity: 50, unitPriceMinor: 900 }],
        speedTiers: [{ turnaroundMinutes: 120, surchargeMinor: 2500 }],
        clientTips: ["Default tip"],
        templateTips: ["Default tip"],
      }),
    ).toEqual({
      minimumOrder: "5",
      bulkFrom: "50",
      bulkPrice: "9",
      rushHours: "2",
      rushFee: "25",
      tips: "",
    });
  });
});

describe("standing in plain words", () => {
  const facts = readTemplateFacts({ managed: true, shopConfirmed: true })!;

  it("says Live, Price check today and Hidden", () => {
    expect(templateStanding({ onTheBoard: true, template: facts }).label).toBe("Live");
    expect(
      templateStanding({
        onTheBoard: true,
        reviewStatus: "pending",
        hasApprovedVersion: false,
        template: facts,
      }).label,
    ).toBe("Price check today");
    expect(templateStanding({ onTheBoard: false, template: facts }).label).toBe("Hidden");
  });

  it("holds the switch while prices wait for the shop", () => {
    const prepared = readTemplateFacts({ managed: true, shopConfirmed: false })!;
    const s = templateStanding({ onTheBoard: false, template: prepared });
    expect(s.label).toBe("Prices to confirm");
    expect(s.switchable).toBe(false);
    expect(
      templateStanding({
        onTheBoard: false,
        template: readTemplateFacts({ needsPrice: true }),
      }).label,
    ).toBe("Needs a price");
  });

  it("puts a take-down above everything but a merge", () => {
    expect(
      templateStanding({ onTheBoard: false, suspendReason: "x", template: facts }).label,
    ).toBe("Taken down by GRIDGO");
  });

  it("writes the check card line", () => {
    expect(checkProductsLine({ needPrice: 2, toConfirm: 1 })).toBe(
      "2 need a price, 1 with prices from GRIDGO to confirm. Hidden from clients until you do.",
    );
  });
});

describe("ready time", () => {
  it("uses GRIDGO's own date, never the chip", () => {
    expect(readyByLine({ earliestReadyBy: "2026-11-24T06:00:00.000Z" })).toBe(
      "Ordered now, ready by Tue 24 Nov, 2:00 PM",
    );
    expect(readyByLine({ earliestReadyBy: null })).toBeNull();
    expect(
      readyChipLabel([{ code: "next_day", label: "Next working day" }], "next_day"),
    ).toBe("Ready: next working day");
  });
});

describe("requests and the team's desk", () => {
  it("reads requests newest first", () => {
    const list = normalizeSetupRequests({
      requests: [
        {
          id: "a",
          kind: "template",
          status: "pending",
          requestedName: "A3 posters",
          version: 1,
        },
        { id: "b", kind: "setup", status: "completed", fileIds: ["f1"], version: 2 },
      ],
    });
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
    expect(list[0]!.fileIds).toEqual(["f1"]);
    expect(setupRequestStatus(list[1]!)).toBe(
      "With the GRIDGO team, about one working day",
    );
  });

  it("picks the shop's live service line for the template's category", () => {
    const services = [
      { id: "s0", categoryCode: "marketing_collateral", state: "withdrawn" },
      { id: "s1", categoryCode: "marketing_collateral", state: "live" },
    ];
    expect(serviceFor({ categoryCode: "marketing_collateral" }, services)?.id).toBe("s1");
    expect(serviceFor({ categoryCode: "apparel" }, services)).toBeNull();
  });

  it("keeps open-order products out of the apply and lists every version", () => {
    const plan = normalizeMigrationPlan({
      supplierId: "u1",
      dryRun: true,
      actions: [
        { action: "match", itemId: "i1", expectedVersion: 3, templateId: "tpl_flyers" },
        {
          action: "merge_variants",
          itemId: "i2",
          expectedVersion: 1,
          variants: [
            { itemId: "i2", label: "A4", priceMinor: 100, expectedVersion: 1 },
            { itemId: "i3", label: "A3", priceMinor: 200, expectedVersion: 4 },
          ],
        },
      ],
      manual: [{ itemId: "i9", reason: "open_orders" }],
    });
    expect(expectedVersionsOf(plan)).toEqual({ i1: 3, i2: 1, i3: 4 });
    expect(isOpenOrderSkip(plan.manual[0]!.reason)).toBe(true);
    expect(migrationManualLine("open_orders")).toBe("Skipped: it has open orders.");
  });

  it("says when the same-day price check is due", () => {
    expect(priceCheckTargetLine("2026-11-24", "2026-11-24")).toBe(
      "Check today, Tue 24 Nov",
    );
    expect(priceCheckTargetLine("2026-11-23", "2026-11-24")).toBe(
      "Overdue since Mon 23 Nov",
    );
  });
});
