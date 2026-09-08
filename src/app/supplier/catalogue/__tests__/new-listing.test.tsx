// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Taxonomy } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  getTaxonomy: vi.fn(),
  listMySupplierServices: vi.fn(),
  listListingStarters: vi.fn(),
  createCatalogItem: vi.fn(),
}));

vi.stubGlobal("React", React);

class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    getTaxonomy: mocks.getTaxonomy,
    listMySupplierServices: mocks.listMySupplierServices,
    listListingStarters: mocks.listListingStarters,
    createCatalogItem: mocks.createCatalogItem,
  };
});

import NewListingPage from "@/app/supplier/catalogue/new/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const taxonomy: Taxonomy = {
  categories: [
    {
      id: "taxc_marketing_collateral",
      code: "marketing_collateral",
      name: "Marketing & Promotional Collateral",
      bestFor: "Businesses promoting a service.",
      sortOrder: 1,
      productFamilyIds: [],
      active: true,
    },
  ],
  subcategories: [
    {
      id: "taxs_flyers",
      code: "flyers",
      categoryCode: "marketing_collateral",
      name: "Flyers",
      examples: ["A5"],
      sortOrder: 1,
      active: true,
    },
    {
      id: "taxs_tarpaulins_outdoor_banners",
      code: "tarpaulins_outdoor_banners",
      categoryCode: "marketing_collateral",
      name: "Tarpaulin & Outdoor Banners",
      examples: ["10x10"],
      sortOrder: 2,
      active: true,
    },
  ],
  materials: [],
  finishes: [],
};

function stubLoad() {
  mocks.getTaxonomy.mockResolvedValue(taxonomy);
  mocks.listMySupplierServices.mockResolvedValue({
    services: [
      {
        id: "svc_1",
        categoryCode: "marketing_collateral",
        state: "live",
        turnaroundHours: 48,
        formatCodes: ["pdf"],
      },
    ],
  });
  mocks.listListingStarters.mockResolvedValue({ starters: [] });
  mocks.createCatalogItem.mockResolvedValue({ item: { id: "sci_new" } });
}

async function chooseKind(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Kind of work" }));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("new listing printer cap", () => {
  it("hides max printer width until the listing is tarpaulin", async () => {
    stubLoad();
    render(<NewListingPage />);

    expect(await screen.findByLabelText("What clients will call it")).toBeVisible();
    expect(screen.queryByLabelText("Max printer width")).not.toBeInTheDocument();

    await chooseKind("Flyers");
    expect(screen.queryByLabelText("Max printer width")).not.toBeInTheDocument();

    await chooseKind("Tarpaulin & Outdoor Banners");
    expect(screen.getByLabelText("Max printer width")).toBeVisible();
    expect(screen.getByText("feet")).toBeVisible();
  });

  it("does not send a printer cap number for other families", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<NewListingPage />);

    const name = await screen.findByLabelText("What clients will call it");
    await user.type(name, "A5 Flyers");
    await chooseKind("Flyers");
    await user.click(screen.getByRole("button", { name: "Open this listing" }));

    await waitFor(() => expect(mocks.createCatalogItem).toHaveBeenCalled());
    const flyersBody = mocks.createCatalogItem.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(flyersBody).toMatchObject({
      subcategoryCode: "flyers",
      name: "A5 Flyers",
    });
    expect(flyersBody).not.toHaveProperty("printerMaxWidthFeet");
  });

  it("blocks create until tarpaulin listings set max printer width in feet", async () => {
    const user = userEvent.setup();
    stubLoad();
    render(<NewListingPage />);

    const name = await screen.findByLabelText("What clients will call it");
    await user.type(name, "Storefront tarpaulin");
    await chooseKind("Tarpaulin & Outdoor Banners");
    expect(screen.getByRole("button", { name: "Open this listing" })).toBeDisabled();
    await user.type(screen.getByLabelText("Max printer width"), "7");
    await user.click(screen.getByRole("button", { name: "Open this listing" }));

    await waitFor(() => expect(mocks.createCatalogItem).toHaveBeenCalled());
    expect(mocks.createCatalogItem.mock.calls[0]?.[0]).toMatchObject({
      subcategoryCode: "tarpaulins_outdoor_banners",
      name: "Storefront tarpaulin",
      printerMaxWidthFeet: 7,
    });
  });
});
