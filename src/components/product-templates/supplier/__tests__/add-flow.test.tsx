// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

import { FLYERS, LinkStub, MUGS, SERVICES, catalogue, stubDom } from "./fixtures";

const mocks = vi.hoisted(() => ({
  listMyProductTemplates: vi.fn(),
  previewTemplateProduct: vi.fn(),
  createTemplateProduct: vi.fn(),
  listMySupplierServices: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

stubDom();

vi.mock("next/link", () => ({ default: LinkStub }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock("@/lib/api/product-templates", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/product-templates")>(
    "@/lib/api/product-templates",
  );
  return {
    ...actual,
    listMyProductTemplates: mocks.listMyProductTemplates,
    previewTemplateProduct: mocks.previewTemplateProduct,
    createTemplateProduct: mocks.createTemplateProduct,
  };
});
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, listMySupplierServices: mocks.listMySupplierServices };
});

import AddTemplateProductPage from "@/app/supplier/catalogue/add/page";

beforeEach(() => {
  mocks.listMyProductTemplates.mockResolvedValue(catalogue([FLYERS, MUGS]));
  mocks.listMySupplierServices.mockResolvedValue(SERVICES);
  mocks.previewTemplateProduct.mockResolvedValue({
    scheduling: { earliestReadyBy: "2026-11-25T06:00:00.000Z" },
    calendar: { days: [] },
  });
  mocks.createTemplateProduct.mockResolvedValue({ item: { id: "sci_new" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function tickFlyersAndGoToPrices(user: ReturnType<typeof userEvent.setup>) {
  render(<AddTemplateProductPage />);
  await user.click(await screen.findByRole("checkbox", { name: /^Flyers/ }));
  await user.click(screen.getByRole("button", { name: "Next: prices" }));
  await screen.findByRole("heading", { name: "Prices for Flyers" });
}

describe("add a product in three steps", () => {
  it("ticks, prices and saves the exact body, then says the price check is today", async () => {
    const user = userEvent.setup();
    await tickFlyersAndGoToPrices(user);
    expect(screen.getByRole("progressbar", { name: /Step 2 of 3/ })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "I make A5 / Gloss" }));
    await user.type(screen.getByRole("textbox", { name: /Full price for A5 \/ Gloss/ }), "12.50");
    await user.click(screen.getByRole("checkbox", { name: "I make A4 / Gloss" }));
    await user.type(screen.getByRole("textbox", { name: /Full price for A4 \/ Gloss/ }), "20");
    expect(within(screen.getByTestId("client-sees")).getByText(/From ₱12\.50 per piece/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next: ready time" }));
    await user.click(await screen.findByRole("radio", { name: "Next working day" }));
    expect(await screen.findByText("Ordered now, ready by Wed 25 Nov, 2:00 PM")).toBeVisible();
    expect(mocks.previewTemplateProduct).toHaveBeenCalledWith({
      templateId: "tpl_flyers",
      supplierServiceId: "svc_marketing",
      readyTime: "next_day",
      prices: [
        { optionKey: "standard", priceMinor: 1250 },
        { optionKey: "variant_1", priceMinor: 2000 },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Save product" }));
    await waitFor(() =>
      expect(mocks.createTemplateProduct).toHaveBeenCalledWith({
        templateId: "tpl_flyers",
        supplierServiceId: "svc_marketing",
        readyTime: "next_day",
        prices: [
          { optionKey: "standard", priceMinor: 1250 },
          { optionKey: "variant_1", priceMinor: 2000 },
        ],
        minimumOrderQuantity: null,
        priceTiers: [],
        speedTiers: [],
      }),
    );
    expect(await screen.findByRole("heading", { name: "Flyers is saved" })).toBeVisible();
    expect(screen.getByText(/Price check today/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Open product" })).toHaveAttribute(
      "href",
      "/supplier/catalogue/product/sci_new",
    );
  });

  it("blocks an empty or ₱0 price on the row and says how many need fixing", async () => {
    const user = userEvent.setup();
    await tickFlyersAndGoToPrices(user);
    await user.click(screen.getByRole("checkbox", { name: "I make A5 / Gloss" }));
    await user.type(screen.getByRole("textbox", { name: /Full price for A5 \/ Gloss/ }), "0");
    await user.click(screen.getByRole("checkbox", { name: "I make A4 / Gloss" }));
    await user.click(screen.getByRole("button", { name: "Next: ready time" }));

    expect(screen.getByTestId("flow-foot-note")).toHaveTextContent("2 ticked options need a price above ₱0.");
    expect(screen.getByTestId("price-row-standard")).toHaveAttribute("data-invalid", "true");
    expect(screen.getAllByText("Enter a price above ₱0, or untick it.")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Prices for Flyers" })).toBeVisible();
    expect(mocks.createTemplateProduct).not.toHaveBeenCalled();
  });

  it("sends More options: bulk, minimum, rush and tips", async () => {
    const user = userEvent.setup();
    await tickFlyersAndGoToPrices(user);
    await user.click(screen.getByRole("checkbox", { name: "I make A5 / Gloss" }));
    await user.type(screen.getByRole("textbox", { name: /Full price for A5 \/ Gloss/ }), "10");
    await user.click(screen.getByRole("button", { name: "Next: ready time" }));
    await user.click(await screen.findByRole("radio", { name: "Same day" }));
    await user.click(screen.getByTestId("more-options-toggle"));
    await user.type(screen.getByRole("textbox", { name: "Bulk discount starts at, how many" }), "100");
    await user.type(screen.getByRole("textbox", { name: "Bulk price each" }), "8");
    await user.type(screen.getByRole("textbox", { name: "Minimum order" }), "10");
    await user.type(screen.getByRole("textbox", { name: "Rush, hours" }), "2");
    await user.click(screen.getByRole("button", { name: "Save product" }));
    expect(screen.getByTestId("flow-foot-note")).toHaveTextContent("Rush: enter the extra fee, above ₱0.");
    await user.type(screen.getByRole("textbox", { name: "Rush fee" }), "50");
    await user.type(screen.getByRole("textbox", { name: "Tips for the client" }), "Send a PDF");
    await user.click(screen.getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(mocks.createTemplateProduct).toHaveBeenCalled());
    expect(mocks.createTemplateProduct.mock.calls[0]![0]).toMatchObject({
      readyTime: "same_day",
      minimumOrderQuantity: 10,
      priceTiers: [{ minQuantity: 100, unitPriceMinor: 800 }],
      speedTiers: [{ label: "Rush", turnaroundMinutes: 120, priceMinor: null, surchargeMinor: 5000 }],
      clientTips: "Send a PDF",
    });
  });

  it("walks two ticked products one after the other", async () => {
    mocks.listMySupplierServices.mockResolvedValue({
      services: [...SERVICES.services, { id: "svc_gifts", categoryCode: "corporate_gifts", state: "live" }],
    });
    const user = userEvent.setup();
    render(<AddTemplateProductPage />);
    await user.click(await screen.findByRole("checkbox", { name: /^Flyers/ }));
    await user.click(screen.getByRole("checkbox", { name: /^Mugs/ }));
    await user.click(screen.getByRole("button", { name: "Next: prices for 2" }));
    expect(await screen.findByText("Product 1 of 2: Flyers")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "I make A5 / Gloss" }));
    await user.type(screen.getByRole("textbox", { name: /Full price for A5/ }), "10");
    await user.click(screen.getByRole("button", { name: "Next: ready time" }));
    await user.click(await screen.findByRole("radio", { name: "Same day" }));
    await user.click(screen.getByRole("button", { name: "Save product" }));
    expect(await screen.findByText("Product 2 of 2: Mugs")).toBeVisible();
    expect(screen.getByText(/Flyers is saved/)).toBeVisible();
    // A one-option product is ticked for the shop.
    expect(screen.getByRole("checkbox", { name: "I make 11 oz / White" })).toBeChecked();
  });

  it("sends a product outside the shop's services to Services, and opens one already added", async () => {
    mocks.listMyProductTemplates.mockResolvedValue(
      catalogue([{ ...FLYERS, addedItemIds: ["sci_9"] }, MUGS]),
    );
    const user = userEvent.setup();
    render(<AddTemplateProductPage />);
    await user.click(await screen.findByRole("button", { name: /^Mugs\. Add this service first/ }));
    expect(screen.getByRole("button", { name: "Open my services" })).toHaveAttribute(
      "href",
      "/supplier/services",
    );
    await user.click(screen.getByRole("button", { name: /^Flyers\. Added: open it/ }));
    expect(mocks.push).toHaveBeenCalledWith("/supplier/catalogue/product/sci_9");
  });

  it("offers asking GRIDGO, a custom product and Let GRIDGO set it up when it is not in the list", async () => {
    render(<AddTemplateProductPage />);
    const box = await screen.findByTestId("not-in-list");
    expect(within(box).getByRole("button", { name: "Ask GRIDGO to add it" })).toHaveAttribute(
      "href",
      "/supplier/catalogue/ask",
    );
    expect(within(box).getByRole("button", { name: "Make a custom product" })).toHaveAttribute(
      "href",
      "/supplier/catalogue/new",
    );
    expect(screen.getByTestId("setup-help-row")).toHaveAttribute("href", "/supplier/catalogue/setup");
  });

  it("filters by search and group", async () => {
    const user = userEvent.setup();
    render(<AddTemplateProductPage />);
    await screen.findByRole("checkbox", { name: /^Flyers/ });
    await user.click(screen.getByRole("radio", { name: "Gifts" }));
    expect(screen.queryByRole("checkbox", { name: /^Flyers/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "All" }));
    await user.type(screen.getByRole("textbox", { name: "Search GRIDGO products" }), "A4");
    expect(screen.getByRole("checkbox", { name: /^Flyers/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Mugs/ })).toBeNull();
  });

  it("hands over to the custom builder on an API without templates", async () => {
    mocks.listMyProductTemplates.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<AddTemplateProductPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/supplier/catalogue/new"));
  });

  it("says what GRIDGO refused in plain words", async () => {
    mocks.createTemplateProduct.mockRejectedValue(
      new ApiError(409, { error: "template_already_added" }),
    );
    const user = userEvent.setup();
    await tickFlyersAndGoToPrices(user);
    await user.click(screen.getByRole("checkbox", { name: "I make A5 / Gloss" }));
    await user.type(screen.getByRole("textbox", { name: /Full price for A5/ }), "10");
    await user.click(screen.getByRole("button", { name: "Next: ready time" }));
    await user.click(await screen.findByRole("radio", { name: "Same day" }));
    await user.click(screen.getByRole("button", { name: "Save product" }));
    expect(
      await screen.findByText("You already have this product. Open it from Products to change its prices."),
    ).toBeVisible();
  });
});
