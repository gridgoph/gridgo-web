// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupplierService, Taxonomy } from "@/lib/api/types";

const { getTaxonomyMock, listServicesMock, listStartersMock } = vi.hoisted(() => ({
  getTaxonomyMock: vi.fn(),
  listServicesMock: vi.fn(),
  listStartersMock: vi.fn(),
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

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    getTaxonomy: getTaxonomyMock,
    listSupplierServices: listServicesMock,
    listListingStarters: listStartersMock,
  };
});

import AdminCataloguePage from "@/app/admin/catalogue/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function service(partial: Partial<SupplierService> & Pick<SupplierService, "id">): SupplierService {
  return {
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
    ...partial,
  };
}

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
    {
      id: "taxc_corporate_event_merch",
      code: "corporate_event_merch",
      name: "Corporate & Event Merchandise",
      bestFor: "Events and branded kits.",
      sortOrder: 2,
      productFamilyIds: [],
      active: true,
    },
    {
      id: "taxc_recognition_awards_signage",
      code: "recognition_awards_signage",
      name: "Recognition, Awards & Signage",
      sortOrder: 3,
      productFamilyIds: [],
      active: true,
    },
    {
      id: "taxc_specialized_prototyping",
      code: "specialized_prototyping",
      name: "Specialized & Prototyping Services",
      sortOrder: 4,
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
      examples: ["A5", "A4"],
      sortOrder: 1,
      active: true,
    },
    {
      id: "taxs_brochures",
      code: "brochures",
      categoryCode: "marketing_collateral",
      name: "Brochures",
      sortOrder: 2,
      active: true,
    },
    {
      id: "taxs_business_cards",
      code: "business_cards",
      categoryCode: "marketing_collateral",
      name: "Business cards",
      sortOrder: 4,
      active: true,
    },
    {
      id: "taxs_lanyards",
      code: "lanyards_id_accessories",
      categoryCode: "corporate_event_merch",
      name: "Lanyards & ID accessories",
      sortOrder: 1,
      active: true,
    },
  ],
  materials: [{ id: "taxm_1", code: "tarpaulin_13oz", name: "13oz tarpaulin", categoryCodes: [], active: true }],
  finishes: [{ id: "taxf_1", code: "lamination", name: "Lamination", categoryCodes: [], active: true }],
  categoryAliases: [
    {
      code: "large_format",
      name: "Large format",
      categoryCode: "marketing_collateral",
      active: true,
    },
  ],
};

describe("Admin catalogue chart", () => {
  it("shows categories and print jobs, not materials or finishes tabs", async () => {
    getTaxonomyMock.mockResolvedValue(taxonomy);
    listServicesMock.mockResolvedValue([
      service({ id: "svc_1", supplierId: "shop_1", state: "live" }),
      service({
        id: "svc_2",
        supplierId: "shop_2",
        state: "live",
        categoryCode: "large_format",
      }),
    ]);
    listStartersMock.mockResolvedValue({ starters: [{ id: "st_flyers", name: "Flyers" }] });

    render(<AdminCataloguePage />);

    expect(await screen.findByRole("heading", { name: "Marketing & Promotional Collateral" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Corporate & Event Merchandise" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recognition, Awards & Signage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Specialized & Prototyping Services" })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Flyers/ })).toHaveAttribute(
      "href",
      "/admin/catalogue/jobs/flyers",
    );
    expect(screen.getByRole("link", { name: /Brochures/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Business cards/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lanyards/ })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^Add print job$/i })).toHaveAttribute(
      "href",
      "/admin/catalogue/jobs/new",
    );
    expect(screen.queryByRole("tab", { name: /Materials/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Finishes/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/13oz tarpaulin/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lamination/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 shops are accredited/)).toBeInTheDocument();
    expect(screen.getByText(/Best for Businesses promoting a service/)).toBeInTheDocument();
  });
});
