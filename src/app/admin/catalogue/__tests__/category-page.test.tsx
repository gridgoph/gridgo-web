// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import type { InvalidatePing } from "@/lib/api/types";
import type { SupplierService, Taxonomy, User } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  code: "marketing_collateral",
  listListingStarters: vi.fn(async () => []),
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
  useParams: () => ({ code: mocks.code }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    listListingStarters: mocks.listListingStarters,
    getTaxonomy: mocks.getTaxonomy,
    listSupplierServices: mocks.listSupplierServices,
    listUsers: mocks.listUsers,
    listAllCatalogShops: mocks.listAllCatalogShops,
    getCatalogShop: mocks.getCatalogShop,
    updateTaxonomyCategory: mocks.updateTaxonomyCategory,
  };
});

import EditPrintJobPage from "@/app/admin/catalogue/jobs/[code]/page";
import EditCategoryPage from "@/app/admin/catalogue/categories/[code]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.code = "marketing_collateral";
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


function renderEditor(Page: typeof EditCategoryPage, code: string) {
  mocks.code = code;
  mocks.getTaxonomy.mockResolvedValue(taxonomy);
  mocks.listSupplierServices.mockResolvedValue([]);
  mocks.listUsers.mockResolvedValue([]);
  mocks.listAllCatalogShops.mockResolvedValue([]);
  let listener!: (ping: InvalidatePing) => void;
  const live: LiveContextValue = {
    notifications: [], unreadCount: 0, snapshot: null, live: true,
    subscribe: next => { listener = next; return () => undefined; },
    markRead: async () => {}, markAllRead: async () => {},
    remove: async () => {}, refreshInbox: async () => {},
  };
  render(<LiveContext.Provider value={live}><Page /></LiveContext.Provider>);
  return async () => {
    const calls = mocks.getTaxonomy.mock.calls.length;
    await act(async () => { listener({ resource: "catalog" }); });
    await waitFor(() => expect(mocks.getTaxonomy).toHaveBeenCalledTimes(calls + 1));
  };
}

describe.each([
  ["category", EditCategoryPage, "marketing_collateral"],
  ["print job", EditPrintJobPage, "flyers"],
] as const)("live %s editor", (_label, Page, code) => {
  it("retains unsaved values through a transient failure and recovery", async () => {
    const ping = renderEditor(Page, code);
    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved name" } });
    mocks.getTaxonomy.mockRejectedValueOnce(new TypeError("Offline"));
    await ping();
    expect(await screen.findByLabelText("Name")).toHaveValue("Unsaved name");
    await ping();
    expect(await screen.findByLabelText("Name")).toHaveValue("Unsaved name");
  });

  it.each([403, 404])("clears the draft on definitive HTTP %s", async status => {
    const ping = renderEditor(Page, code);
    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved name" } });
    mocks.getTaxonomy.mockRejectedValueOnce(new ApiError(status, { error: status === 403 ? "forbidden" : "not_found" }));
    await ping();
    await waitFor(() => expect(screen.queryByLabelText("Name")).not.toBeInTheDocument());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      status === 403 ? "This action is restricted to Super Admin." : "That record was not found.",
    );
  });
});


it.each(["success", "failure"] as const)(
  "keeps unfinished example text and focus during background refresh %s",
  async outcome => {
    const ping = renderEditor(EditPrintJobPage, "flyers");
    const input = await screen.findByRole("textbox", { name: "Examples" });
    fireEvent.change(input, { target: { value: "Unfinished example" } });
    input.focus();

    let resolve!: (value: Taxonomy) => void;
    let reject!: (reason: unknown) => void;
    mocks.getTaxonomy.mockReturnValueOnce(new Promise<Taxonomy>((done, fail) => {
      resolve = done;
      reject = fail;
    }));
    await ping();

    expect(screen.getByRole("textbox", { name: "Examples" })).toBe(input);
    expect(input).toHaveValue("Unfinished example");
    expect(input).toHaveFocus();

    await act(async () => {
      if (outcome === "success") resolve(taxonomy);
      else reject(new TypeError("Offline"));
    });

    expect(screen.getByRole("textbox", { name: "Examples" })).toBe(input);
    expect(input).toHaveValue("Unfinished example");
    expect(input).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Add example" }));
    expect(screen.getByRole("button", { name: "Remove Unfinished example" })).toBeVisible();
    expect(input).toHaveValue("");
  },
);
