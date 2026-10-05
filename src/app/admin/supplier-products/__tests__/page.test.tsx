// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Taxonomy } from "@/lib/api/types";

const {
  getTaxonomyMock,
  listStaffCatalogItemsMock,
  getStaffCatalogItemMock,
  suspendStaffCatalogItemMock,
  restoreStaffCatalogItemMock,
} = vi.hoisted(() => ({
  getTaxonomyMock: vi.fn(),
  listStaffCatalogItemsMock: vi.fn(),
  getStaffCatalogItemMock: vi.fn(),
  suspendStaffCatalogItemMock: vi.fn(),
  restoreStaffCatalogItemMock: vi.fn(),
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
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    getTaxonomy: getTaxonomyMock,
    listStaffCatalogItems: listStaffCatalogItemsMock,
    getStaffCatalogItem: getStaffCatalogItemMock,
    suspendStaffCatalogItem: suspendStaffCatalogItemMock,
    restoreStaffCatalogItem: restoreStaffCatalogItemMock,
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
    photos: [
      {
        fileId: "photo_sticker",
        sortOrder: 0,
        altText: "Sticker roll",
        downloadUrl: "https://files.example/sticker.jpg",
      },
    ],
    optionGroups: [
      {
        id: "finish",
        name: "Finish",
        kind: "spec",
        required: false,
        sortOrder: 0,
        options: [
          {
            id: "gloss",
            label: "Gloss",
            priceModifierMinor: 0,
            active: true,
            sortOrder: 0,
          },
        ],
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Supplier products", () => {
  it("lists a sticker priced per metre in the table with its shop, and has no take-down control", async () => {
    getTaxonomyMock.mockResolvedValue(taxonomy);
    listStaffCatalogItemsMock.mockResolvedValue({
      items: [sticker],
      shops: [sticker.shop],
      total: 1,
    });

    render(<AdminSupplierProductsPage />);

    const table = await screen.findByRole("table", { name: "Supplier products" });
    const link = within(table).getByRole("link", { name: "Die-cut sticker" });
    expect(link).toHaveAttribute("href", "/admin/supplier-products/sticker");
    const row = link.closest("tr")!;
    expect(within(row).getByTestId("listing-shop")).toHaveTextContent("Metre Press");
    expect(within(row).getByText("Stickers")).toBeInTheDocument();
    expect(within(row).getByText("₱25.00 per m")).toBeInTheDocument();
    expect(within(row).getByText("Finish: Gloss")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Sticker roll" })).toBeInTheDocument();
    expect(within(row).getByText("On the board")).toBeInTheDocument();
    expect(screen.getByTestId("listing-count")).toHaveTextContent("1 listing");
    expect(screen.queryByRole("button", { name: /take down/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
  });

  it("shows how many listings remain and loads the next page into the same table", async () => {
    const user = userEvent.setup();
    getTaxonomyMock.mockResolvedValue(taxonomy);
    const second = {
      ...sticker,
      item: { ...sticker.item, id: "banner", name: "Vinyl banner", photos: [] },
    };
    listStaffCatalogItemsMock
      .mockResolvedValueOnce({
        items: [sticker],
        shops: [sticker.shop],
        total: 2,
        nextCursor: "c2",
      })
      .mockResolvedValueOnce({ items: [second], shops: [sticker.shop], total: 2 });

    render(<AdminSupplierProductsPage />);

    expect(await screen.findByTestId("listing-count")).toHaveTextContent(
      "Showing 1 of 2 listings",
    );
    await user.click(screen.getByRole("button", { name: "Show more listings" }));

    const table = screen.getByRole("table", { name: "Supplier products" });
    expect(
      await within(table).findByRole("link", { name: "Vinyl banner" }),
    ).toBeInTheDocument();
    expect(listStaffCatalogItemsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "c2" }),
    );
    expect(screen.getByTestId("listing-count")).toHaveTextContent("2 listings");
    expect(
      screen.queryByRole("button", { name: "Show more listings" }),
    ).not.toBeInTheDocument();
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
      expect(suspendStaffCatalogItemMock).toHaveBeenCalledWith(
        "sticker",
        "Blurry sample",
      );
    });
    expect(
      await screen.findByRole("heading", { name: /^Taken down/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Blurry sample")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore listing" })).toBeInTheDocument();
  });

  it("caps the reason at 2,000 characters", async () => {
    getTaxonomyMock.mockResolvedValue(taxonomy);
    getStaffCatalogItemMock.mockResolvedValue(sticker);

    render(<AdminSupplierProductPage />);

    expect(await screen.findByLabelText("Reason the shop will see")).toHaveAttribute(
      "maxLength",
      "2000",
    );
  });

  it("shows when it was taken down and restores it, saying it stays hidden for the shop", async () => {
    const user = userEvent.setup();
    getTaxonomyMock.mockResolvedValue(taxonomy);
    getStaffCatalogItemMock.mockResolvedValue({
      ...sticker,
      item: {
        ...sticker.item,
        active: false,
        suspendReason: "Priced per metre",
        suspendedAt: "2026-10-04T07:12:00.000Z",
      },
    });
    restoreStaffCatalogItemMock.mockImplementation(async () => {
      getStaffCatalogItemMock.mockResolvedValue({
        ...sticker,
        item: { ...sticker.item, active: false },
      });
      return {};
    });

    render(<AdminSupplierProductPage />);

    expect(
      await screen.findByRole("heading", { name: /^Taken down Oct 4, 2026/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore listing" }));

    await waitFor(() => {
      expect(restoreStaffCatalogItemMock).toHaveBeenCalledWith("sticker");
    });
    expect(
      await screen.findByText(/stays hidden until the shop puts it back/),
    ).toBeInTheDocument();
    expect(screen.getByText("Off the board")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take down" })).toBeInTheDocument();
  });
});
