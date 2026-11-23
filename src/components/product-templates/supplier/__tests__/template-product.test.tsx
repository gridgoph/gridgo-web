// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

import { FLYERS, LinkStub, catalogue, stubDom, templateProduct } from "./fixtures";

const mocks = vi.hoisted(() => ({
  getTemplateProduct: vi.fn(),
  listMyProductTemplates: vi.fn(),
  templateReadyPreview: vi.fn(),
  updateTemplateProduct: vi.fn(),
  confirmTemplateProduct: vi.fn(),
  updateCatalogItem: vi.fn(),
}));

stubDom();

vi.mock("next/link", () => ({ default: LinkStub }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "sci_1" }) }));
vi.mock("@/lib/api/product-templates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/product-templates")>(
    "@/lib/api/product-templates",
  );
  return {
    ...actual,
    getTemplateProduct: mocks.getTemplateProduct,
    listMyProductTemplates: mocks.listMyProductTemplates,
    templateReadyPreview: mocks.templateReadyPreview,
    updateTemplateProduct: mocks.updateTemplateProduct,
    confirmTemplateProduct: mocks.confirmTemplateProduct,
  };
});
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, updateCatalogItem: mocks.updateCatalogItem };
});

import TemplateProductPage from "@/app/supplier/catalogue/product/[id]/page";

beforeEach(() => {
  mocks.getTemplateProduct.mockResolvedValue(templateProduct());
  mocks.listMyProductTemplates.mockResolvedValue(catalogue([{ ...FLYERS, addedItemIds: ["sci_1"] }]));
  mocks.templateReadyPreview.mockResolvedValue({
    scheduling: { earliestReadyBy: "2026-11-25T06:00:00.000Z" },
  });
  mocks.updateTemplateProduct.mockResolvedValue({ item: { id: "sci_1" } });
  mocks.confirmTemplateProduct.mockResolvedValue({ item: { id: "sci_1" } });
  mocks.updateCatalogItem.mockResolvedValue({ item: { id: "sci_1" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("one template product", () => {
  it("confirms prices the GRIDGO team prepared, untouched", async () => {
    mocks.getTemplateProduct.mockResolvedValue(
      templateProduct({ item: { active: false }, template: { shopConfirmed: false } }),
    );
    const user = userEvent.setup();
    render(<TemplateProductPage />);
    expect(await screen.findByRole("heading", { name: "Prices to confirm" })).toBeVisible();
    // Nothing to hide or show before the shop confirms.
    expect(screen.queryByRole("switch")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm prices" }));
    await waitFor(() => expect(mocks.confirmTemplateProduct).toHaveBeenCalledWith("sci_1", 4));
    expect(mocks.updateTemplateProduct).not.toHaveBeenCalled();
  });

  it("saves a changed prepared table, which also confirms it", async () => {
    mocks.getTemplateProduct.mockResolvedValue(
      templateProduct({ item: { active: false }, template: { shopConfirmed: false } }),
    );
    const user = userEvent.setup();
    render(<TemplateProductPage />);
    const price = await screen.findByRole("textbox", { name: /Full price for A5 \/ Gloss/ });
    await user.clear(price);
    await user.type(price, "15");
    await user.click(screen.getByRole("button", { name: "Save and confirm" }));
    await waitFor(() =>
      expect(mocks.updateTemplateProduct).toHaveBeenCalledWith("sci_1", 4, {
        templateId: "tpl_flyers",
        readyTime: "next_day",
        prices: [{ optionKey: "standard", priceMinor: 1500 }],
        minimumOrderQuantity: null,
        priceTiers: [],
        speedTiers: [],
      }),
    );
    expect(mocks.confirmTemplateProduct).not.toHaveBeenCalled();
  });

  it("hides a live product with its version, and shows no save until something changes", async () => {
    const user = userEvent.setup();
    render(<TemplateProductPage />);
    const toggle = await screen.findByRole("switch", { name: /Live\. Turn off to hide it/ });
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    expect(screen.getByText(/A new price is for new orders only/)).toBeVisible();
    await user.click(toggle);
    await waitFor(() =>
      expect(mocks.updateCatalogItem).toHaveBeenCalledWith("sci_1", 4, { active: false }),
    );
  });

  it("explains a stale version in plain words", async () => {
    mocks.updateTemplateProduct.mockRejectedValue(new ApiError(409, { error: "catalog_item_stale" }));
    const user = userEvent.setup();
    render(<TemplateProductPage />);
    const price = await screen.findByRole("textbox", { name: /Full price for A5 \/ Gloss/ });
    await user.clear(price);
    await user.type(price, "13");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/changed on another screen/);
  });

  it("links photos and extras to the full builder", async () => {
    render(<TemplateProductPage />);
    const link = await screen.findByRole("link", { name: /Photos and extras/ });
    expect(link).toHaveAttribute("href", "/supplier/catalogue/sci_1");
  });
});
