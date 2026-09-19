// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  code: "flyers",
  replace: vi.fn(),
  toastAdd: vi.fn(),
  listListingStarters: vi.fn(async () => []),
  getTaxonomy: vi.fn(),
  listSupplierServices: vi.fn(async () => []),
  listUsers: vi.fn(async () => []),
  listAllCatalogShops: vi.fn(async () => []),
  getCatalogShop: vi.fn(),
  updateTaxonomyCategory: vi.fn(),
  updateTaxonomySubcategory: vi.fn(),
  deleteTaxonomyCategory: vi.fn(),
  deleteTaxonomySubcategory: vi.fn(),
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
  useParams: () => ({ code: mocks.code }),
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock("@/components/ui/toast", () => ({ toast: { add: mocks.toastAdd } }));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    listListingStarters: mocks.listListingStarters,
    getTaxonomy: mocks.getTaxonomy,
    listSupplierServices: mocks.listSupplierServices,
    listUsers: mocks.listUsers,
    listAllCatalogShops: mocks.listAllCatalogShops,
    getCatalogShop: mocks.getCatalogShop,
    updateTaxonomyCategory: mocks.updateTaxonomyCategory,
    updateTaxonomySubcategory: mocks.updateTaxonomySubcategory,
    deleteTaxonomyCategory: mocks.deleteTaxonomyCategory,
    deleteTaxonomySubcategory: mocks.deleteTaxonomySubcategory,
  };
});

import EditPrintJobPage from "@/app/admin/catalogue/jobs/[code]/page";
import EditCategoryPage from "@/app/admin/catalogue/categories/[code]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.code = "flyers";
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

async function openDeleteDialog(verb: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: verb }));
  return screen.findByRole("alertdialog");
}

describe("print job danger zone", () => {
  it("keeps Delete apart from Save and disarmed until the code is typed back", async () => {
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
    render(<EditPrintJobPage />);

    const zone = await screen.findByRole("region", { name: "Delete print job" });
    expect(within(zone).getByText("Danger zone")).toBeInTheDocument();
    expect(
      within(zone).getByRole("button", { name: "Delete print job…" }),
    ).toBeInTheDocument();
    expect(
      within(zone).queryByRole("button", { name: /Save print job/ }),
    ).not.toBeInTheDocument();

    const dialog = await openDeleteDialog(/^Delete print job…$/);
    expect(within(dialog).getByText("Delete “Flyers” for good?")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete print job" });
    expect(confirm).toBeDisabled();

    const input = within(dialog).getByRole("textbox");
    fireEvent.change(input, { target: { value: "flyer" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "FLYERS" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "flyers" } });
    expect(confirm).toBeEnabled();
    expect(mocks.deleteTaxonomySubcategory).not.toHaveBeenCalled();
  });

  it("deletes, toasts, and returns to the chart", async () => {
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
    mocks.deleteTaxonomySubcategory.mockResolvedValue({
      ok: true,
      deleted: { kind: "subcategory", id: "taxs_flyers", code: "flyers", name: "Flyers" },
    });
    render(<EditPrintJobPage />);

    const dialog = await openDeleteDialog(/^Delete print job…$/);
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "flyers" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete print job" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/catalogue"));
    expect(mocks.deleteTaxonomySubcategory).toHaveBeenCalledWith("flyers");
    expect(mocks.toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Deleted Flyers." }),
    );
  });

  it("stays on the page on 409 in use, names the shops, and offers to hide instead", async () => {
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
    mocks.deleteTaxonomySubcategory.mockRejectedValue(
      new ApiError(409, {
        error: "catalog_entry_in_use",
        kind: "subcategory",
        code: "flyers",
        canRetire: true,
        usage: {
          listings: 2,
          shops: [{ supplierId: "shop_1", shopName: "Printlab Davao" }],
          orders: 1,
          starters: 0,
        },
      }),
    );
    mocks.updateTaxonomySubcategory.mockResolvedValue({
      ...taxonomy.subcategories![0],
      active: false,
    });
    render(<EditPrintJobPage />);

    const dialog = await openDeleteDialog(/^Delete print job…$/);
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "flyers" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete print job" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Cannot delete while in use");
    expect(alert).toHaveTextContent(
      "2 listings are filed against it from 1 shop: Printlab Davao.",
    );
    expect(alert).toHaveTextContent("1 order was placed against those listings.");
    expect(alert).not.toHaveTextContent("starter");
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.toastAdd).not.toHaveBeenCalled();

    fireEvent.click(
      within(alert).getByRole("button", { name: "Hide from new listings" }),
    );
    await waitFor(() =>
      expect(mocks.updateTaxonomySubcategory).toHaveBeenCalledWith("flyers", {
        active: false,
      }),
    );
    expect(await within(alert).findByRole("status")).toHaveTextContent(
      "Hidden from new listings.",
    );
    expect(
      within(alert).queryByRole("button", { name: "Hide from new listings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show this job for new listings" }),
    ).not.toBeChecked();
  });

  it("does not offer to hide what is already hidden", async () => {
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
    mocks.deleteTaxonomySubcategory.mockRejectedValue(
      new ApiError(409, {
        error: "catalog_entry_in_use",
        kind: "subcategory",
        code: "flyers",
        canRetire: false,
        usage: { listings: 1, shops: [], orders: 0, starters: 1 },
      }),
    );
    render(<EditPrintJobPage />);

    const dialog = await openDeleteDialog(/^Delete print job…$/);
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "flyers" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete print job" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("1 GRIDGO starter is seeded for it.");
    expect(alert).toHaveTextContent("It is already hidden from new listings.");
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the general admin copy for any other failure", async () => {
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
    mocks.deleteTaxonomySubcategory.mockRejectedValue(
      new ApiError(403, { error: "forbidden" }),
    );
    render(<EditPrintJobPage />);

    const dialog = await openDeleteDialog(/^Delete print job…$/);
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "flyers" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete print job" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This action is restricted to Super Admin.",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("category danger zone", () => {
  it("explains a build-shipped category and hides it on request", async () => {
    mocks.code = "marketing_collateral";
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
    mocks.deleteTaxonomyCategory.mockRejectedValue(
      new ApiError(409, {
        error: "catalog_entry_shipped",
        kind: "category",
        code: "marketing_collateral",
        canRetire: true,
      }),
    );
    mocks.updateTaxonomyCategory.mockResolvedValue({
      ...taxonomy.categories[0],
      active: false,
    });
    render(<EditCategoryPage />);

    const dialog = await openDeleteDialog(/^Delete category…$/);
    expect(
      within(dialog).getByText("Delete “Marketing & Promotional Collateral” for good?"),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "marketing_collateral" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete category" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Cannot delete: it ships with GRIDGO");
    expect(alert).toHaveTextContent("would come back on the next deploy");
    fireEvent.click(
      within(alert).getByRole("button", { name: "Hide from new listings" }),
    );
    await waitFor(() =>
      expect(mocks.updateTaxonomyCategory).toHaveBeenCalledWith("marketing_collateral", {
        active: false,
      }),
    );
    expect(
      screen.getByRole("switch", { name: "Show this category for accreditation" }),
    ).not.toBeChecked();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("deletes an empty category and returns to the chart", async () => {
    mocks.code = "marketing_collateral";
    mocks.getTaxonomy.mockResolvedValue({ ...taxonomy, subcategories: [] });
    mocks.deleteTaxonomyCategory.mockResolvedValue({
      ok: true,
      deleted: {
        kind: "category",
        id: "taxc_marketing_collateral",
        code: "marketing_collateral",
        name: "Marketing & Promotional Collateral",
      },
    });
    render(<EditCategoryPage />);

    const dialog = await openDeleteDialog(/^Delete category…$/);
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "marketing_collateral" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete category" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin/catalogue"));
    expect(mocks.deleteTaxonomyCategory).toHaveBeenCalledWith("marketing_collateral");
    expect(mocks.toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Deleted Marketing & Promotional Collateral." }),
    );
  });
});
