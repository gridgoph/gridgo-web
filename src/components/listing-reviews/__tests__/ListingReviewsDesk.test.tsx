// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Taxonomy } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  listCatalogReviews: vi.fn(),
  decideCatalogReview: vi.fn(),
  getStaffPublicCatalogItem: vi.fn(),
  listProductTypeRequests: vi.fn(),
  decideProductTypeRequest: vi.fn(),
  listStaffCatalogItems: vi.fn(),
  listUsers: vi.fn(),
  getTaxonomy: vi.fn(),
  listAcceptedFileFormats: vi.fn(),
}));

const search = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.stubGlobal("React", React);

// Base UI's checkbox dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

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
  useSearchParams: () => search.params,
  usePathname: () => "/ops/listing-reviews",
}));

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { ListingReviewsDesk } from "@/components/listing-reviews/ListingReviewsDesk";
import { ApiError } from "@/lib/api/client";

const taxonomy: Taxonomy = {
  categories: [
    {
      id: "cat_labels",
      code: "labels",
      name: "Labels & stickers",
      active: true,
      productFamilyIds: [],
    },
  ],
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
} as Taxonomy;

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "sci_new",
    supplierId: "usr_shop_a",
    supplierServiceId: "svc_1",
    subcategoryCode: "stickers",
    name: "Die-cut stickers",
    description: "Vinyl, cut to shape.",
    basePriceMinor: 2500,
    pricingUnit: "per_unit",
    turnaroundMode: "override",
    turnaroundDays: 2,
    turnaroundHours: 20,
    reviewStatus: "pending",
    hasApprovedVersion: false,
    version: 7,
    updatedAt: "2026-10-05T02:00:00Z",
    acceptedFormats: [{ code: "pdf" }],
    photos: [
      { fileId: "f1", sortOrder: 0, downloadUrl: "https://files.example/f1" },
      { fileId: "f2", sortOrder: 1, downloadUrl: "https://files.example/f2" },
    ],
    optionGroups: [
      {
        id: "grp_size",
        name: "Size",
        kind: "spec",
        required: true,
        options: [{ id: "s", label: "2 in", priceModifierMinor: 0, active: true }],
      },
    ],
    reviewBlockers: [],
    ...overrides,
  };
}

beforeEach(() => {
  search.params = new URLSearchParams();
  api.listCatalogReviews.mockImplementation(async (status: string) =>
    status === "pending"
      ? {
          items: [
            item(),
            item({
              id: "sci_change",
              name: "Glossy flyers",
              hasApprovedVersion: true,
              updatedAt: "2026-10-05T05:00:00Z",
            }),
          ],
          nextCursor: null,
        }
      : { items: [], nextCursor: null },
  );
  api.listProductTypeRequests.mockResolvedValue({
    requests: [
      {
        id: "ptr_1",
        supplierId: "usr_shop_a",
        categoryCode: "labels",
        name: "Holographic stickers",
        description: "Rainbow foil stickers.",
        status: "pending",
        version: 2,
        createdAt: "2026-10-05T01:00:00Z",
      },
    ],
    nextCursor: null,
  });
  api.listStaffCatalogItems.mockResolvedValue({
    items: [],
    shops: [{ supplierId: "usr_shop_a", shopName: "Shop A" }],
    total: 0,
  });
  api.listUsers.mockResolvedValue([]);
  api.getTaxonomy.mockResolvedValue(taxonomy);
  api.listAcceptedFileFormats.mockResolvedValue([
    { code: "pdf", displayName: "PDF", inputKind: "file" },
  ]);
  api.getStaffPublicCatalogItem.mockResolvedValue({
    item: item({ id: "sci_change", name: "Glossy flyers", basePriceMinor: 2000 }),
  });
  api.decideCatalogReview.mockResolvedValue({ item: item({ reviewStatus: "approved" }) });
  api.decideProductTypeRequest.mockResolvedValue({ request: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Listing reviews desk", () => {
  it("lists waiting listings oldest first with their shop and opens the oldest", async () => {
    render(<ListingReviewsDesk tree="ops" />);
    const list = await screen.findByRole("list", { name: "Listings" });
    expect(await screen.findByText("Ready in 2 working days")).toBeInTheDocument();
    expect(screen.queryByText("Ready in 20 hours")).not.toBeInTheDocument();
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Die-cut stickers"),
      expect.stringContaining("Glossy flyers"),
    ]);
    expect(rows[0]).toHaveTextContent("Shop A · Stickers");
    expect(rows[1]).toHaveTextContent("Change");
    expect(screen.getByRole("button", { name: "Listings · 2" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Die-cut stickers" }),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: /Sample photo 1/ })).toHaveAttribute(
      "src",
      "https://files.example/f1",
    );
  });

  it("unlocks Approve only after every photo check, and attests to it", async () => {
    const user = userEvent.setup();
    render(<ListingReviewsDesk tree="ops" />);
    const approve = await screen.findByRole("button", { name: "Approve listing" });
    expect(approve).toBeDisabled();
    expect(screen.getByText("Check all 2 photos for")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: /No watermark/ }));
    await user.click(screen.getByRole("checkbox", { name: /No logo/ }));
    expect(approve).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /No shop branding/ }));
    expect(approve).toBeEnabled();
    await user.click(approve);
    await waitFor(() =>
      expect(api.decideCatalogReview).toHaveBeenCalledWith("sci_new", 7, {
        status: "approved",
        photosUnbranded: true,
      }),
    );
    expect(await screen.findByText(/Approved “Die-cut stickers”/)).toBeVisible();
  });

  it("will not approve an unfinished listing and says what is missing", async () => {
    api.listCatalogReviews.mockResolvedValue({
      items: [item({ reviewBlockers: ["specs_required", "photo"] })],
      nextCursor: null,
    });
    render(<ListingReviewsDesk tree="ops" />);
    expect(
      await screen.findByText("Not finished, so it cannot be approved yet"),
    ).toBeVisible();
    expect(screen.getByText(/no spec a client picks from/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve listing" })).toBeDisabled();
  });

  it("names no fallback artwork formats when the listing accepts none", async () => {
    api.listCatalogReviews.mockResolvedValue({
      items: [item({ acceptedFormats: [], reviewBlockers: ["accepted_file_formats"] })],
      nextCursor: null,
    });
    render(<ListingReviewsDesk tree="ops" />);
    expect(await screen.findByText("It accepts no artwork formats.")).toBeVisible();
    expect(screen.queryByText("Artwork accepted")).not.toBeInTheDocument();
    expect(screen.queryByText("The service line's formats")).not.toBeInTheDocument();
  });

  it("names the service line's formats when the listing inherits them", async () => {
    api.listCatalogReviews.mockResolvedValue({
      items: [item({ acceptedFormats: [] })],
      nextCursor: null,
    });
    render(<ListingReviewsDesk tree="ops" />);
    expect(await screen.findByText("The service line's formats")).toBeVisible();
  });

  it("sends back only with a reason the shop will read", async () => {
    const user = userEvent.setup();
    render(<ListingReviewsDesk tree="ops" />);
    await user.click(await screen.findByRole("button", { name: "Send back" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(
      within(dialog).getByText("Write the reason the shop will read."),
    ).toBeVisible();
    expect(api.decideCatalogReview).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: /watermark, logo or shop branding/ }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    await waitFor(() =>
      expect(api.decideCatalogReview).toHaveBeenCalledWith("sci_new", 7, {
        status: "needs_revision",
        reason: expect.stringMatching(/^A sample photo shows a watermark/),
      }),
    );
  });

  it("compares a change with the version clients see now", async () => {
    const user = userEvent.setup();
    render(<ListingReviewsDesk tree="ops" />);
    const list = await screen.findByRole("list", { name: "Listings" });
    await user.click(
      within(within(list).getAllByRole("listitem")[1]).getByRole("button"),
    );
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Price" })).toBeVisible();
    expect(table).toHaveTextContent("₱20.00 per piece");
    expect(table).toHaveTextContent("₱25.00 per piece");
  });

  it("explains a decision someone else already made and reloads", async () => {
    const user = userEvent.setup();
    api.decideCatalogReview.mockRejectedValueOnce(
      new ApiError(409, { error: "listing_not_pending" }),
    );
    render(<ListingReviewsDesk tree="ops" />);
    await screen.findByRole("button", { name: "Approve listing" });
    for (const name of [/No watermark/, /No logo/, /No shop branding/]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    await user.click(screen.getByRole("button", { name: "Approve listing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already decided/);
    expect(api.listCatalogReviews.mock.calls.length).toBeGreaterThan(1);
  });

  it("adds a requested product type under a code, without approving anything else", async () => {
    const user = userEvent.setup();
    search.params = new URLSearchParams("tab=types");
    render(<ListingReviewsDesk tree="admin" />);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Holographic stickers" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Asked for by Shop A, under Labels & stickers/),
    ).toBeVisible();
    expect(screen.getByText("Stickers")).toBeVisible();
    const code = screen.getByLabelText("Code for the new product type");
    expect(code).toHaveValue("holographic_stickers");
    await user.clear(code);
    await user.type(code, "stickers");
    await user.click(screen.getByRole("button", { name: "Add product type" }));
    expect(screen.getByText("A product type already uses that code.")).toBeVisible();
    expect(api.decideProductTypeRequest).not.toHaveBeenCalled();
    await user.clear(code);
    await user.type(code, "holo_stickers");
    await user.click(screen.getByRole("button", { name: "Add product type" }));
    await waitFor(() =>
      expect(api.decideProductTypeRequest).toHaveBeenCalledWith("ptr_1", 2, {
        status: "approved",
        code: "holo_stickers",
      }),
    );
  });

  it("links Super Admin to the listing on Supplier products, and Operations not", async () => {
    const { unmount } = render(<ListingReviewsDesk tree="admin" />);
    expect(
      await screen.findByRole("link", { name: "Open on Supplier products" }),
    ).toHaveAttribute("href", "/admin/supplier-products/sci_new");
    unmount();
    render(<ListingReviewsDesk tree="ops" />);
    await screen.findByRole("heading", { level: 2, name: "Die-cut stickers" });
    expect(screen.queryByRole("link", { name: "Open on Supplier products" })).toBeNull();
  });
});
