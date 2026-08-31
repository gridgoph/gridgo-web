// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupplierService, Taxonomy, User } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  getTaxonomy: vi.fn(),
  listSupplierServices: vi.fn(),
  listUsers: vi.fn(),
  listAllCatalogShops: vi.fn(),
  getCatalogShop: vi.fn(),
  updateTaxonomyCategory: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ code: "marketing_collateral" }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    getTaxonomy: mocks.getTaxonomy,
    listSupplierServices: mocks.listSupplierServices,
    listUsers: mocks.listUsers,
    listAllCatalogShops: mocks.listAllCatalogShops,
    getCatalogShop: mocks.getCatalogShop,
    updateTaxonomyCategory: mocks.updateTaxonomyCategory,
  };
});

import EditCategoryPage from "@/app/admin/catalogue/categories/[code]/page";

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
  ],
  materials: [],
  finishes: [],
};

function service(): SupplierService {
  return {
    id: "svc_1",
    supplierId: "shop_1",
    categoryCode: "marketing_collateral",
    materialCodes: [],
    finishCodes: [],
    productFamilyIds: [],
    sizeMin: null,
    sizeMax: null,
    qtyMin: null,
    qtyMax: null,
    pricingBasis: "unit",
    referenceRateMinor: 0,
    turnaroundHours: 24,
    capacityDaily: 5,
    capacityWeekly: 25,
    zones: [],
    equipmentNotes: "",
    state: "live",
    verifiedAt: null,
    suspendedAt: null,
    suspendReason: null,
    withdrawnAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("category sheet", () => {
  it("shows accredited shops and their listings on the floor", async () => {
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
    mocks.listSupplierServices.mockResolvedValue([service()]);
    mocks.listUsers.mockResolvedValue([
      {
        id: "shop_1",
        email: "a@x",
        name: "Ann",
        role: "supplier",
        supplierName: "Printlab Davao",
      } as User,
    ]);
    mocks.listAllCatalogShops.mockResolvedValue([
      { supplierId: "shop_1", shopName: "Printlab Davao", itemCount: 1 },
    ]);
    mocks.getCatalogShop.mockResolvedValue({
      supplierId: "shop_1",
      shopName: "Printlab Davao",
      services: [
        {
          id: "svc_1",
          categoryCode: "marketing_collateral",
          items: [
            {
              id: "item_1",
              name: "A5 Flyers",
              subcategoryCode: "flyers",
              fromPriceMinor: 800,
              photos: [{ fileId: "file_1" }],
            },
          ],
        },
      ],
    });

    render(<EditCategoryPage />);

    expect(
      await screen.findByRole("heading", { name: "Marketing & Promotional Collateral" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Printlab Davao")).toBeInTheDocument();
    expect(screen.getByText("A5 Flyers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save category/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back to chart/i })).toBeInTheDocument();
  });
});
