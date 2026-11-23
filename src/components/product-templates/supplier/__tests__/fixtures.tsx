import React from "react";
import { vi } from "vitest";

/** Shared setup for the supplier template screens' tests. */
export function stubDom() {
  vi.stubGlobal("React", React);
  class FakePointerEvent extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params);
    }
  }
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
}

export function LinkStub({
  href,
  children,
  ...props
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

export const FLYERS = {
  id: "tpl_flyers",
  version: 1,
  active: true,
  name: "Flyers",
  description: "Flyers made to your selected specifications.",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  group: "marketing",
  unit: "piece",
  options: [
    { key: "standard", label: "A5 / Gloss" },
    { key: "variant_1", label: "A4 / Gloss" },
  ],
  optionLists: [
    { name: "Size", options: ["A5", "A4"] },
    { name: "Finish", options: ["Gloss"] },
  ],
  fileTypes: ["pdf"],
  clientTips: ["Send a print-ready file."],
  express: false,
  machinesNeeded: ["document_printer"],
  stockPhotos: [{ url: "/product-template-photos/lst_flyers.jpg", altText: "Flyers" }],
  priceRange: { minMinor: 500, maxMinor: 5000 },
  addedItemIds: [] as string[],
  machineMatch: null,
};

export const MUGS = {
  ...FLYERS,
  id: "tpl_drinkware",
  name: "Mugs",
  categoryCode: "corporate_gifts",
  subcategoryCode: "drinkware",
  group: "gifts",
  options: [{ key: "standard", label: "11 oz / White" }],
  optionLists: [],
};

export const READY_TIMES = [
  { code: "same_day", label: "Same day" },
  { code: "next_day", label: "Next working day" },
];

export function catalogue(
  templates: unknown[] = [FLYERS],
  extra: Record<string, unknown> = {},
) {
  return {
    templates,
    readyTimes: READY_TIMES,
    checkYourProducts: { supplierId: "u1", actions: [], manual: [], unpricedItemIds: [] },
    ...extra,
  };
}

export const SERVICES = {
  services: [
    { id: "svc_marketing", categoryCode: "marketing_collateral", state: "live" },
  ],
};

/** `GET /me/template-products/:id` for a product made from Flyers. */
export function templateProduct(
  overrides: {
    item?: Record<string, unknown>;
    template?: Record<string, unknown>;
    prices?: { optionKey: string; priceMinor: number }[];
  } = {},
) {
  return {
    item: {
      id: "sci_1",
      name: "Flyers",
      subcategoryCode: "flyers",
      supplierServiceId: "svc_marketing",
      basePriceMinor: 1200,
      active: true,
      reviewStatus: "approved",
      hasApprovedVersion: true,
      version: 4,
      photos: [{ url: "/product-template-photos/lst_flyers.jpg", realPhoto: false }],
      priceTiers: [],
      speedTiers: [],
      minimumOrderQuantity: null,
      ...overrides.item,
      template: {
        templateId: "tpl_flyers",
        managed: true,
        priceOnly: true,
        unit: "piece",
        readyTime: "next_day",
        clientTips: ["Send a print-ready file."],
        shopConfirmed: true,
        optionKeys: {},
        priceCheck: { required: false, flags: [] },
        ...overrides.template,
      },
    },
    prices: overrides.prices ?? [{ optionKey: "standard", priceMinor: 1200 }],
  };
}
