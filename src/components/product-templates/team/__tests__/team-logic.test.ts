import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { PriceTier } from "@/lib/listings";
import {
  normalizeMigrationPlan,
  type ProductTemplate,
  type SetupRequest,
} from "@/lib/product-templates";

import { splitPlan } from "../MigrationSection";
import { categoryResolver } from "../ShopTemplateProducts";
import {
  combineOptionLists,
  decisionBlocker,
  draftFromTemplate,
  emptyTemplateDraft,
  governedPhotos,
  keepShopExtras,
  migrationChoices,
  orderRequests,
  removedOptionKeys,
  requestsForTemplate,
  resolveRequestsBody,
  templateBody,
  templateErrorMessage,
  templateErrors,
  type TemplateDraft,
} from "../team-logic";

function request(overrides: Partial<SetupRequest>): SetupRequest {
  return {
    id: "psr_1",
    supplierId: "usr_shop_a",
    kind: "setup",
    requestedName: null,
    message: null,
    fileIds: [],
    status: "pending",
    reason: null,
    templateId: null,
    version: 1,
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: null,
    ...overrides,
  };
}

const template: ProductTemplate = {
  id: "tpl_flyers",
  version: 3,
  active: true,
  name: "Flyers",
  description: "Single sheet flyers.",
  categoryCode: "paper",
  subcategoryCode: "flyers",
  group: "paper_prints",
  unit: "piece",
  options: [
    { key: "standard", label: "A4", specBinding: null },
    { key: "variant_1", label: "A5", specBinding: null },
  ],
  optionLists: [{ name: "Size", options: ["A4", "A5"] }],
  fileTypes: ["pdf"],
  clientTips: ["Send a PDF.", "Leave a margin."],
  express: false,
  machinesNeeded: ["document_printer"],
  stockPhotos: [
    {
      url: "/product-template-photos/flyers.jpg",
      altText: "Flyers",
      src: "http://api/product-template-photos/flyers.jpg",
    },
  ],
  photoUrl: "http://api/product-template-photos/flyers.jpg",
  photoAlt: "Flyers",
  priceRange: { minMinor: 500, maxMinor: 5000 },
  addedItemIds: [],
  machineMatch: null,
};

const ctx = {
  subcategories: [{ code: "flyers", categoryCode: "paper" }],
  formatCodes: new Set(["pdf", "png"]),
  photoUrls: new Set(["/product-template-photos/flyers.jpg"]),
};

describe("setup requests", () => {
  it("puts waiting requests first, oldest first, then the rest newest first", () => {
    const ordered = orderRequests([
      request({ id: "done_old", status: "completed", updatedAt: "2026-11-01T00:00:00Z" }),
      request({ id: "wait_new", createdAt: "2026-11-22T00:00:00Z" }),
      request({
        id: "done_new",
        status: "needs_revision",
        updatedAt: "2026-11-23T00:00:00Z",
      }),
      request({ id: "wait_old", createdAt: "2026-11-19T00:00:00Z" }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual([
      "wait_old",
      "wait_new",
      "done_new",
      "done_old",
    ]);
  });

  it("needs a reason the shop reads, and a template to complete a template request", () => {
    const tpl = request({ kind: "template" });
    expect(
      decisionBlocker({
        request: tpl,
        status: "completed",
        reason: "Added.",
        templateId: null,
      }),
    ).toMatch(/Choose the template/);
    expect(
      decisionBlocker({
        request: tpl,
        status: "completed",
        reason: "Added.",
        templateId: "tpl_flyers",
      }),
    ).toBeNull();
    expect(
      decisionBlocker({
        request: tpl,
        status: "needs_revision",
        reason: "  ",
        templateId: null,
      }),
    ).toMatch(/Write what the shop reads/);
    expect(
      decisionBlocker({
        request: request({}),
        status: "completed",
        reason: "x".repeat(2001),
        templateId: null,
      }),
    ).toMatch(/2,000/);
  });
});

describe("template editor", () => {
  it("round-trips a template into the full PUT definition", () => {
    const body = templateBody(draftFromTemplate(template));
    expect(body).toEqual({
      name: "Flyers",
      description: "Single sheet flyers.",
      categoryCode: "paper",
      subcategoryCode: "flyers",
      group: "paper_prints",
      unit: "piece",
      active: true,
      express: false,
      options: [
        { key: "standard", label: "A4", specBinding: null },
        { key: "variant_1", label: "A5", specBinding: null },
      ],
      optionLists: [{ name: "Size", options: ["A4", "A5"] }],
      fileTypes: ["pdf"],
      clientTips: ["Send a PDF.", "Leave a margin."],
      machinesNeeded: ["document_printer"],
      stockPhotos: [{ url: "/product-template-photos/flyers.jpg", altText: "Flyers" }],
      priceRange: { minMinor: 500, maxMinor: 5000 },
    });
  });

  it("passes a complete draft and names every field the API would refuse", () => {
    expect(templateErrors(draftFromTemplate(template), ctx)).toEqual({});
    const bad: TemplateDraft = {
      ...emptyTemplateDraft(),
      id: "Bad-Id",
      options: [
        { key: "a", label: "Same", specBinding: null },
        { key: "b", label: "same", specBinding: null },
      ],
      fileTypes: ["retired_format"],
      stockPhotos: [{ url: "/somewhere/else.jpg", altText: "x" }],
      priceMin: "50",
      priceMax: "10",
    };
    expect(Object.keys(templateErrors(bad, ctx)).sort()).toEqual(
      [
        "clientTips",
        "description",
        "fileTypes",
        "group",
        "id",
        "machinesNeeded",
        "name",
        "options",
        "priceRange",
        "stockPhotos",
        "subcategoryCode",
      ].sort(),
    );
    expect(templateErrors(bad, ctx).options).toMatch(/repeats/);
    expect(templateErrors(bad, ctx).priceRange).toMatch(/low end/);
  });

  it("refuses more than 200 options", () => {
    const draft = {
      ...draftFromTemplate(template),
      options: Array.from({ length: 201 }, (_, i) => ({
        key: `k${i}`,
        label: `L${i}`,
        specBinding: null,
      })),
    };
    expect(templateErrors(draft, ctx).options).toMatch(/200/);
  });

  it("builds every combination and keeps the keys shops already priced", () => {
    const options = combineOptionLists(
      [
        { name: "Size", values: "A4, A5" },
        { name: "Paper", values: "Glossy, Matte" },
      ],
      [{ key: "standard", label: "A4 / Glossy", specBinding: null }],
    );
    expect(options).toEqual([
      { key: "standard", label: "A4 / Glossy", specBinding: null },
      { key: "variant_1", label: "A4 / Matte", specBinding: null },
      { key: "variant_2", label: "A5 / Glossy", specBinding: null },
      { key: "variant_3", label: "A5 / Matte", specBinding: null },
    ]);
    expect(removedOptionKeys(options, options.slice(0, 2))).toEqual([
      "A5 / Glossy",
      "A5 / Matte",
    ]);
  });

  it("offers only the stock photos templates already use", () => {
    expect(governedPhotos([template, { ...template, id: "tpl_b" }])).toEqual([
      {
        url: "/product-template-photos/flyers.jpg",
        altText: "Flyers",
        src: "http://api/product-template-photos/flyers.jpg",
      },
    ]);
  });

  it("explains a stale save", () => {
    expect(
      templateErrorMessage(new ApiError(409, { error: "product_template_stale" })),
    ).toMatch(/Someone else saved/);
    expect(templateErrorMessage(new Error("x"))).toBeNull();
  });
});

describe("closing product-type requests with a template", () => {
  it("offers pending requests in the template's category and sends their versions", () => {
    const requests = [
      { id: "ptr_a3", status: "pending", categoryCode: "paper", version: 4 },
      { id: "ptr_done", status: "approved", categoryCode: "paper", version: 2 },
      { id: "ptr_other", status: "pending", categoryCode: "apparel", version: 1 },
    ];
    const matching = requestsForTemplate(requests, template);
    expect(matching.map((r) => r.id)).toEqual(["ptr_a3"]);
    expect(resolveRequestsBody(matching)).toEqual([{ id: "ptr_a3", expectedVersion: 4 }]);
  });
});

describe("shop products", () => {
  it("carries the shop's own offers forward on a revision", () => {
    const tiers: PriceTier[] = [{ minQuantity: 100, unitPriceMinor: 400 }];
    const body = keepShopExtras(
      {
        minimumOrderQuantity: 50,
        priceTiers: tiers,
        speedTiers: [],
        printerMaxWidthFeet: null,
      },
      ["Bring your own paper."],
    );
    expect(body).toEqual({
      minimumOrderQuantity: 50,
      priceTiers: [{ minQuantity: 100, unitPriceMinor: 400 }],
      speedTiers: [],
      clientTips: "Bring your own paper.",
    });
  });

  it("maps a retired category code to its current one unless the alias is ambiguous", () => {
    const resolve = categoryResolver({
      categoryAliases: [
        { code: "old_paper", name: "Old", categoryCode: "paper" },
        { code: "mixed", name: "Mixed", categoryCode: "paper", ambiguous: true },
      ],
    });
    expect(resolve("old_paper")).toBe("paper");
    expect(resolve("mixed")).toBe("mixed");
    expect(resolve("apparel")).toBe("apparel");
  });
});

describe("existing-product migration", () => {
  it("sends only answered matches and complete merges", () => {
    expect(migrationChoices({ sci_a: "tpl_flyers", sci_b: "" }, [])).toEqual({
      templateMatches: { sci_a: "tpl_flyers" },
    });
    expect(
      migrationChoices({}, [
        { keepId: "sci_a", sourceIds: ["sci_b"], labels: { sci_a: "A4", sci_b: "A3" } },
        { keepId: "sci_c", sourceIds: [], labels: {} },
      ]),
    ).toEqual({
      mergeGroups: [
        { keepId: "sci_a", sourceIds: ["sci_b"], labels: { sci_a: "A4", sci_b: "A3" } },
      ],
    });
    expect(migrationChoices({}, [])).toEqual({});
  });

  it("splits a plan into changes, open-order skips and what needs a person", () => {
    const plan = normalizeMigrationPlan({
      actions: [
        {
          action: "attach_template",
          itemId: "sci_a",
          expectedVersion: 2,
          templateId: "tpl_flyers",
        },
      ],
      manual: [
        { itemId: "sci_b", reason: "open_orders" },
        { itemId: "sci_c", reason: "merge_has_open_orders" },
        {
          itemId: "sci_d",
          reason: "ambiguous_template",
          templateIds: ["tpl_flyers", "tpl_posters"],
        },
      ],
    });
    const split = splitPlan(plan);
    expect(split.changes.map((a) => a.itemId)).toEqual(["sci_a"]);
    expect(split.openOrders.map((m) => m.itemId)).toEqual(["sci_b", "sci_c"]);
    expect(split.manual.map((m) => m.itemId)).toEqual(["sci_d"]);
  });
});
