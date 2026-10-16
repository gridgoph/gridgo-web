// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFeaturedPrintsMock,
  saveFeaturedPrintsMock,
  listStaffCatalogItemsMock,
  getStaffPublicCatalogItemMock,
  getStaffCatalogItemMock,
  getTaxonomyMock,
} = vi.hoisted(() => ({
  getFeaturedPrintsMock: vi.fn(),
  saveFeaturedPrintsMock: vi.fn(),
  listStaffCatalogItemsMock: vi.fn(),
  getStaffPublicCatalogItemMock: vi.fn(),
  getStaffCatalogItemMock: vi.fn(),
  getTaxonomyMock: vi.fn(),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    getFeaturedPrints: getFeaturedPrintsMock,
    saveFeaturedPrints: saveFeaturedPrintsMock,
    listStaffCatalogItems: listStaffCatalogItemsMock,
    getStaffPublicCatalogItem: getStaffPublicCatalogItemMock,
    getStaffCatalogItem: getStaffCatalogItemMock,
    getTaxonomy: getTaxonomyMock,
  };
});

import { FeaturedPrintsDesk } from "@/components/featured-prints/FeaturedPrintsDesk";
import { ApiError } from "@/lib/api/client";

const SHOP = "Hidden Shop Name";

function card(id: string, name: string, priceMinor: number) {
  return {
    id,
    name,
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    clientFromPriceMinor: priceMinor,
    pricingUnit: "per_unit",
    packageQty: null,
    measureUnit: null,
    minimumOrderQuantity: null,
    photos: [
      {
        fileId: `file_${id}`,
        sortOrder: 0,
        url: `/catalog/media/file_${id}`,
        downloadUrl: `https://storage.example/${id}.jpg`,
      },
    ],
  };
}

const flyers = card("sci_flyer", "Flyers", 1100);
const cards = card("sci_card", "Business cards", 55000);
const mugs = card("sci_mug", "Mugs", 11000);

function setting(version: number, items: ReturnType<typeof card>[]) {
  return {
    version,
    catalogItemIds: items.map((item) => item.id),
    items: items.map((item) => ({ catalogItemId: item.id, available: true, item })),
  };
}

/** A staff index row: it carries the shop, which this screen must never draw. */
function staffRow(item: ReturnType<typeof card>) {
  return {
    shop: { supplierId: "user_shop", shopName: SHOP },
    item: {
      id: item.id,
      name: `${item.name} (draft name)`,
      subcategoryCode: item.subcategoryCode,
      basePriceMinor: 999,
      pricingUnit: "per_unit",
      photos: [],
      optionGroups: [],
    },
  };
}

beforeEach(() => {
  getTaxonomyMock.mockResolvedValue({
    categories: [],
    materials: [],
    finishes: [],
    subcategories: [
      { id: "job_flyers", code: "flyers", categoryCode: "marketing_collateral", name: "Flyers", active: true },
    ],
  });
  listStaffCatalogItemsMock.mockResolvedValue({
    items: [staffRow(cards), staffRow(mugs)],
    shops: [{ supplierId: "user_shop", shopName: SHOP }],
    total: 2,
  });
  getStaffPublicCatalogItemMock.mockImplementation(async (id: string) => {
    const item = [flyers, cards, mugs].find((candidate) => candidate.id === id);
    if (!item) throw new ApiError(404, { error: "catalog_item_not_found" });
    return {
      item: {
        ...item,
        supplierId: "user_shop",
        fromPriceMinor: 999,
        optionGroups: [{ kind: "spec", options: [{ label: "A5" }, { label: "Glossy" }] }],
      },
    };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderDesk() {
  const user = userEvent.setup();
  render(<FeaturedPrintsDesk />);
  await screen.findByRole("list", { name: "Featured order" });
  await screen.findByRole("button", { name: "Add Business cards" });
  return user;
}

function orderNames() {
  return within(screen.getByRole("list", { name: "Featured order" }))
    .getAllByTestId("featured-entry")
    .map((row) => row.textContent ?? "");
}

describe("FeaturedPrintsDesk", () => {
  it("shows the saved row and previews it without naming a shop", async () => {
    getFeaturedPrintsMock.mockResolvedValue(setting(3, [flyers]));
    await renderDesk();

    const preview = screen.getByTestId("featured-prints-preview");
    expect(within(preview).getByText("FEATURED PRINTS")).toBeInTheDocument();
    expect(
      within(preview).getByText("Choose what you need and GRIDGO finds the printer."),
    ).toBeInTheDocument();
    expect(within(preview).getByText("Flyers")).toBeInTheDocument();
    expect(within(preview).getByText("From ₱11.00")).toBeInTheDocument();
    expect(within(preview).getByText("each")).toBeInTheDocument();

    // Search results come from the approved item, never the staff index's
    // shop, draft name or draft price.
    expect(screen.queryByText(new RegExp(SHOP))).not.toBeInTheDocument();
    expect(screen.queryByText(/draft name/)).not.toBeInTheDocument();
    expect(screen.queryByText(/₱9\.99/)).not.toBeInTheDocument();
    expect(screen.getAllByText("A5, Glossy")).toHaveLength(2);
  });

  it("adds, reorders and saves the whole list with the read version and a reason", async () => {
    getFeaturedPrintsMock.mockResolvedValue(setting(3, [flyers]));
    saveFeaturedPrintsMock.mockResolvedValue(setting(4, [mugs, flyers, cards]));
    const user = await renderDesk();

    expect(screen.getByRole("button", { name: "Save Featured Prints" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add Business cards" }));
    await user.click(screen.getByRole("button", { name: "Add Mugs" }));
    expect(screen.getByRole("button", { name: "Mugs is already featured" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Mugs earlier" }));
    await user.click(screen.getByRole("button", { name: "Move Mugs earlier" }));
    expect(orderNames().map((text) => text.match(/Flyers|Business cards|Mugs/)?.[0])).toEqual([
      "Mugs",
      "Flyers",
      "Business cards",
    ]);

    // No reason, no request.
    await user.click(screen.getByRole("button", { name: "Save Featured Prints" }));
    expect(saveFeaturedPrintsMock).not.toHaveBeenCalled();
    expect(screen.getByText("Say why you are changing Featured Prints.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Reason for this change"), "  Mugs for the holidays  ");
    await user.click(screen.getByRole("button", { name: "Save Featured Prints" }));
    await waitFor(() =>
      expect(saveFeaturedPrintsMock).toHaveBeenCalledWith({
        expectedVersion: 3,
        catalogItemIds: ["sci_mug", "sci_flyer", "sci_card"],
        reason: "Mugs for the holidays",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save Featured Prints" })).toBeDisabled(),
    );
    expect(screen.getByLabelText("Reason for this change")).toHaveValue("");
  });

  it("on a version conflict shows the other list and saves on its version only when kept", async () => {
    getFeaturedPrintsMock.mockResolvedValueOnce(setting(3, [flyers]));
    const user = await renderDesk();
    getFeaturedPrintsMock.mockResolvedValue(setting(5, [cards]));
    saveFeaturedPrintsMock.mockRejectedValueOnce(
      new ApiError(409, { error: "featured_prints_version_conflict", version: 5 }),
    );

    await user.click(screen.getByRole("button", { name: "Add Mugs" }));
    await user.type(screen.getByLabelText("Reason for this change"), "Add mugs");
    await user.click(screen.getByRole("button", { name: "Save Featured Prints" }));

    expect(
      await screen.findByText("Someone else saved Featured Prints after you started"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Their list: Business cards\./)).toBeInTheDocument();
    // No blind retry: Save waits for a choice.
    expect(screen.getByRole("button", { name: "Save Featured Prints" })).toBeDisabled();
    expect(saveFeaturedPrintsMock).toHaveBeenCalledTimes(1);

    saveFeaturedPrintsMock.mockResolvedValueOnce(setting(6, [flyers, mugs]));
    await user.click(screen.getByRole("button", { name: "Keep my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Featured Prints" }));
    await waitFor(() =>
      expect(saveFeaturedPrintsMock).toHaveBeenLastCalledWith({
        expectedVersion: 5,
        catalogItemIds: ["sci_flyer", "sci_mug"],
        reason: "Add mugs",
      }),
    );
  });

  it("can take the other person's list instead", async () => {
    getFeaturedPrintsMock.mockResolvedValueOnce(setting(3, [flyers]));
    const user = await renderDesk();
    getFeaturedPrintsMock.mockResolvedValue(setting(5, [cards]));
    saveFeaturedPrintsMock.mockRejectedValueOnce(
      new ApiError(409, { error: "featured_prints_version_conflict", version: 5 }),
    );
    await user.click(screen.getByRole("button", { name: "Add Mugs" }));
    await user.type(screen.getByLabelText("Reason for this change"), "Add mugs");
    await user.click(screen.getByRole("button", { name: "Save Featured Prints" }));
    await user.click(await screen.findByRole("button", { name: "Use their list" }));

    expect(orderNames()).toHaveLength(1);
    expect(orderNames()[0]).toContain("Business cards");
    expect(screen.getByRole("button", { name: "Save Featured Prints" })).toBeDisabled();
  });

  it("marks the products the API refused and saves once they are removed", async () => {
    getFeaturedPrintsMock.mockResolvedValue(setting(3, [flyers]));
    saveFeaturedPrintsMock.mockRejectedValueOnce(
      new ApiError(409, {
        error: "featured_prints_item_unavailable",
        catalogItemIds: ["sci_mug"],
      }),
    );
    const user = await renderDesk();
    await user.click(screen.getByRole("button", { name: "Add Mugs" }));
    await user.type(screen.getByLabelText("Reason for this change"), "Add mugs");
    await user.click(screen.getByRole("button", { name: "Save Featured Prints" }));

    expect(await screen.findByText("Not available to clients")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("featured-prints-preview")).queryByText("Mugs"),
    ).not.toBeInTheDocument();

    saveFeaturedPrintsMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Remove Mugs" }));
    expect(screen.queryByText("Not available to clients")).not.toBeInTheDocument();
    // Back to the saved list: nothing to save.
    expect(screen.getByRole("button", { name: "Save Featured Prints" })).toBeDisabled();
  });

  it("names a stored product that is no longer available, never its shop", async () => {
    getFeaturedPrintsMock.mockResolvedValue({
      version: 2,
      catalogItemIds: ["sci_gone", "sci_flyer"],
      items: [
        { catalogItemId: "sci_gone", available: false, item: null },
        { catalogItemId: "sci_flyer", available: true, item: flyers },
      ],
    });
    getStaffCatalogItemMock.mockResolvedValue({
      shop: { supplierId: "user_shop", shopName: SHOP },
      item: { id: "sci_gone", name: "Old tarpaulin", subcategoryCode: "flyers", photos: [] },
    });
    const user = await renderDesk();

    expect(await screen.findByText("Old tarpaulin")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(SHOP))).not.toBeInTheDocument();
    expect(
      screen.getByText("1 product is no longer available to clients. Remove it to save."),
    ).toBeInTheDocument();

    saveFeaturedPrintsMock.mockResolvedValue(setting(3, [flyers]));
    await user.click(screen.getByRole("button", { name: "Remove Old tarpaulin" }));
    await user.type(screen.getByLabelText("Reason for this change"), "Tarpaulin was taken down");
    await user.click(screen.getByRole("button", { name: "Save Featured Prints" }));
    await waitFor(() =>
      expect(saveFeaturedPrintsMock).toHaveBeenCalledWith({
        expectedVersion: 2,
        catalogItemIds: ["sci_flyer"],
        reason: "Tarpaulin was taken down",
      }),
    );
  });

  it("explains an empty row as the client's catalogue prompt", async () => {
    getFeaturedPrintsMock.mockResolvedValue({ version: 1, catalogItemIds: [], items: [] });
    render(<FeaturedPrintsDesk />);
    expect(
      await screen.findByText("Explore print products to start your first print."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing is featured/)).toBeInTheDocument();
  });

  it("says plainly when the setting cannot be read", async () => {
    getFeaturedPrintsMock.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    render(<FeaturedPrintsDesk />);
    expect(
      await screen.findByText("Only Operations and Super Admin can change Featured Prints."),
    ).toBeInTheDocument();
  });
});
