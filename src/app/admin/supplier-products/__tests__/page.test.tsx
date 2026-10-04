// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Taxonomy } from "@/lib/api/types";

const { getTaxonomyMock, listStaffCatalogItemsMock, getStaffCatalogItemMock, suspendStaffCatalogItemMock } =
  vi.hoisted(() => ({
    getTaxonomyMock: vi.fn(),
    listStaffCatalogItemsMock: vi.fn(),
    getStaffCatalogItemMock: vi.fn(),
    suspendStaffCatalogItemMock: vi.fn(),
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/supplier-products",
  useParams: () => ({ id: "sticker" }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    getTaxonomy: getTaxonomyMock,
    listStaffCatalogItems: listStaffCatalogItemsMock,
    getStaffCatalogItem: getStaffCatalogItemMock,
    suspendStaffCatalogItem: suspendStaffCatalogItemMock,
  };
});

import AdminSupplierProductsPage from "@/app/admin/supplier-products/page";
import AdminSupplierProductPage from "@/app/admin/supplier-products/[id]/page";

const taxonomy: Taxonomy = {
  categories: [],
  materials: [],
  finishes: [],
  subcategories: [
    {
      id: "job_stickers",
      code: "stickers",
      categoryCode: "labels",
      name: "Stickers",
      active: true,
    },
  ],
};

const sticker = {
  shop: { supplierId: "metre", shopName: "Metre Press" },
  item: {
    id: "sticker",
    supplierServiceId: "svc_metre",
    subcategoryCode: "stickers",
    name: "Die-cut sticker",
    description: "Vinyl cut to length",
    basePriceMinor: 2500,
    pricingUnit: "per_length",
    measureUnit: "m",
    active: true,
    updatedAt: "2026-10-02T00:00:00.000Z",
    photos: [{ fileId: "photo_sticker", sortOrder: 0, altText: "Sticker roll", downloadUrl: "https://files.example/sticker.jpg" }],
    optionGroups: [
      {
        id: "finish",
        name: "Finish",
        kind: "spec",
        required: false,
        sortOrder: 0,
        options: [{ id: "gloss", label: "Gloss", priceModifierMinor: 0, active: true, sortOrder: 0 }],
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Supplier products", () => {
  it("shows the shop name on a sticker priced per metre and has no take-down control", async () => {
    getTaxonomyMock.mockResolvedValue(taxonomy);
    listStaffCatalogItemsMock.mockResolvedValue({
      items: [sticker],
      shops: [sticker.shop],
      total: 1,
    });

    render(<AdminSupplierProductsPage />);

    const row = await screen.findByRole("link", { name: /Metre Press/ });
    expect(row).toHaveAttribute("href", "/admin/supplier-products/sticker");
    expect(within(row).getByTestId("listing-shop")).toHaveTextContent("Metre Press");
    expect(within(row).getByText("Die-cut sticker")).toBeInTheDocument();
    expect(within(row).getByText("Stickers")).toBeInTheDocument();
    expect(within(row).getByText("₱25.00 per m")).toBeInTheDocument();
    expect(within(row).getByText("Finish: Gloss")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Sticker roll" })).toBeInTheDocument();
    expect(within(row).getByText("On the board")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take down/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
  });

  it("shows the same shop name on the listing detail", async () => {
    getTaxonomyMock.mockResolvedValue(taxonomy);
    getStaffCatalogItemMock.mockResolvedValue(sticker);

    render(<AdminSupplierProductPage />);

    expect(await screen.findByTestId("listing-shop")).toHaveTextContent("Metre Press");
    expect(screen.getByRole("heading", { name: "Die-cut sticker" })).toBeInTheDocument();
    expect(screen.getByText(/per m/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take down" })).toBeInTheDocument();
    await waitFor(() => {
      expect(getStaffCatalogItemMock).toHaveBeenCalledWith("sticker");
    });
  });

  it("takes the listing down with a reason the shop can read", async () => {
    const user = userEvent.setup();
    getTaxonomyMock.mockResolvedValue(taxonomy);
    getStaffCatalogItemMock.mockResolvedValue(sticker);
    suspendStaffCatalogItemMock.mockImplementation(async () => {
      getStaffCatalogItemMock.mockResolvedValue({
        ...sticker,
        item: { ...sticker.item, active: false, suspendReason: "Blurry sample" },
      });
      return {};
    });

    render(<AdminSupplierProductPage />);
    expect(await screen.findByRole("button", { name: "Take down" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Reason the shop will see"), "Blurry sample");
    await user.click(screen.getByRole("button", { name: "Take down" }));

    await waitFor(() => {
      expect(suspendStaffCatalogItemMock).toHaveBeenCalledWith("sticker", "Blurry sample");
    });
    expect(await screen.findByText("Taken down")).toBeInTheDocument();
    expect(screen.getByText(/Blurry sample/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });
});
