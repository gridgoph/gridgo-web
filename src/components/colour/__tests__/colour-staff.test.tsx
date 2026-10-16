// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order, PlatformSettings } from "@/lib/api/types";
import { staffColourQuote } from "@/test/colour-pricing";

const mocks = vi.hoisted(() => ({
  listColourPriceChecks: vi.fn(),
  getStaffCatalogItem: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/lib/live/useLegalInboxReload", () => ({ useLegalInboxReload: () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...mocks };
});

import { ColourPriceChecks } from "@/components/colour/ColourPriceChecks";
import { ColourPricingRecord } from "@/components/orders/ColourPricingRecord";
import { ColourDetectionSettings } from "@/components/settings/ColourDetectionSettings";
import { ApiError } from "@/lib/api/client";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function order(items: Order["productionItems"]): Pick<Order, "productionItems"> {
  return { productionItems: items };
}

describe("the colour reading at the quality check", () => {
  it("shows each page's strong colour, tier, the shop's rate and the client's all-in rate", () => {
    render(
      <ColourPricingRecord
        audience="staff"
        order={order([
          { id: "l1", itemName: "Whiteprint", quantity: 3, measurement: null, colourPricing: staffColourQuote() },
        ])}
      />,
    );
    const rows = screen.getAllByTestId("colour-page-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Page 1");
    expect(rows[0]).toHaveTextContent("0%");
    expect(rows[0]).toHaveTextContent("No strong colour");
    expect(rows[1]).toHaveTextContent("18%");
    expect(rows[1]).toHaveTextContent("Up to 25%");
    expect(rows[1]).toHaveTextContent("₱60.00");
    expect(rows[1]).toHaveTextContent("₱87.00");
    expect(screen.getByText("Line total, shop")).toBeVisible();
    expect(screen.getByText("₱270.00")).toBeVisible();
    expect(screen.getByText("₱391.50")).toBeVisible();
    expect(screen.getByText("Estimate")).toBeVisible();
  });

  it("marks an unpriced page as a price check and never invents a total", () => {
    const quote = staffColourQuote({ status: "needs_price_check", lineSubtotalMinor: null, clientLineSubtotalMinor: null });
    quote.pages[1] = { ...quote.pages[1], tier: "up_to_50", strongColourBps: 3100, sheetPriceMinor: null, clientSheetPriceMinor: null };
    render(
      <ColourPricingRecord
        audience="staff"
        order={order([{ id: "l1", itemName: "Plans", quantity: 3, measurement: null, colourPricing: quote }])}
      />,
    );
    expect(screen.getAllByTestId("colour-page-row")[1]).toHaveTextContent("Price check");
    expect(screen.getByText("Needs a price check")).toBeVisible();
  });

  it("says the one-colour warning the client saw, with no prices", () => {
    const quote = staffColourQuote({
      status: "fixed_price",
      pricedByColour: false,
      warning:
        "Your file has colour, but this service prints in one colour. Choose a colour service if you need the colours.",
    });
    render(
      <ColourPricingRecord
        audience="staff"
        order={order([{ id: "l1", itemName: "Blueprint", quantity: 3, measurement: null, colourPricing: quote }])}
      />,
    );
    expect(screen.getByText(/The client was told: “Your file has colour/)).toBeVisible();
    expect(screen.getByText("One colour service, fixed price")).toBeVisible();
    expect(screen.queryByText("Line total, shop")).not.toBeInTheDocument();
  });

  it("shows an agreed correction under the original reading, which stays", () => {
    render(
      <ColourPricingRecord
        audience="staff"
        order={order([
          {
            id: "l1",
            itemName: "Whiteprint",
            quantity: 3,
            measurement: null,
            colourPricing: staffColourQuote(),
            agreedColourCorrection: {
              ...staffColourQuote(),
              id: "chg_1",
              appliedAt: "2026-10-17T03:00:00.000Z",
              correctedLineSubtotalMinor: 36_000,
              correctedClientLineSubtotalMinor: 52_200,
            },
          },
        ])}
      />,
    );
    expect(screen.getByText(/Corrected by the shop, agreed by the client/)).toBeVisible();
    expect(screen.getByText("₱360.00")).toBeVisible();
    expect(screen.getAllByTestId("colour-page-row")).toHaveLength(4);
  });

  it("renders nothing for a line without a reading", () => {
    const { container } = render(
      <ColourPricingRecord audience="staff" order={order([{ id: "l1", itemName: "Flyers", quantity: 1, measurement: null }])} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the colour price check queue", () => {
  const missing = () => {
    const quote = staffColourQuote({ status: "needs_price_check", lineSubtotalMinor: null, clientLineSubtotalMinor: null });
    quote.pages[1] = { ...quote.pages[1], strongColourBps: 3100, tier: "up_to_50", sheetPriceMinor: null, status: "needs_price_check" };
    return quote;
  };

  it("groups waiting carts by listing and paper, and shows which tier the shop left blank", async () => {
    mocks.listColourPriceChecks.mockResolvedValue({
      checks: [
        { cartId: "cart_1", lineId: "l1", clientId: "user_client_aaaa11", supplierId: "s", catalogItemId: "sci_white", colourPricing: missing() },
        { cartId: "cart_2", lineId: "l2", clientId: "user_client_bbbb22", supplierId: "s", catalogItemId: "sci_white", colourPricing: missing() },
      ],
    });
    mocks.getStaffCatalogItem.mockResolvedValue({
      shop: { supplierId: "s", shopName: "Shop A" },
      item: {
        id: "sci_white",
        name: "Whiteprint",
        pricingUnit: "per_page",
        pricedByColour: true,
        colourPricing: {
          sizes: [
            {
              paperSize: "20x30",
              tierSet: "large_format",
              widthMilli: 508_000,
              heightMilli: 762_000,
              prices: { none: 3000, up_to_25: 6000, above_50: 20000 },
            },
          ],
        },
      },
    });
    render(<ColourPriceChecks tree="admin" />);
    const card = await screen.findByTestId("colour-price-check");
    expect(within(card).getByText("2 carts waiting")).toBeVisible();
    expect(within(card).getByText("The shop left “Up to 50%” blank on 20x30.")).toBeVisible();
    expect(await within(card).findByText("Shop A")).toBeVisible();
    expect(within(card).getByText("Not priced")).toBeVisible();
    expect(within(card).getByText("₱60.00 a sheet")).toBeVisible();
    expect(within(card).getAllByText(/Page 2: 31%/)).toHaveLength(2);
    expect(within(card).getByRole("link", { name: "Open the listing in Supplier products" })).toHaveAttribute(
      "href",
      "/admin/supplier-products/sci_white",
    );
    expect(mocks.getStaffCatalogItem).toHaveBeenCalledTimes(1);
  });

  it("says when nothing waits, and offers no Super Admin link to Operations", async () => {
    mocks.listColourPriceChecks.mockResolvedValue({ checks: [] });
    render(<ColourPriceChecks tree="ops" />);
    expect(await screen.findByText("No pages are waiting on a shop price")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("colour detection settings", () => {
  const settings = {
    version: 7,
    colourDetection: { minSaturationBps: 2500, minLightnessBps: 500, maxLightnessBps: 8500, a3MonochromeMaxBps: 1000 },
  } as PlatformSettings;

  it("saves the whole object with the version and a reason naming what moved", async () => {
    mocks.updateSettings.mockResolvedValue({
      ...settings,
      version: 8,
      colourDetection: { ...settings.colourDetection!, a3MonochromeMaxBps: 1500 },
    });
    const onSaved = vi.fn();
    render(<ColourDetectionSettings settings={settings} canEdit onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("A3 monochrome limit"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("What prompted the change (optional)"), {
      target: { value: "From a month of orders." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save colour detection" }));
    expect(await screen.findByTestId("colour-detection-confirm")).toHaveTextContent(
      "Colour detection: A3 monochrome limit 10% to 15%.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save the new figures" }));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      expectedVersion: 7,
      colourDetection: { minSaturationBps: 2500, minLightnessBps: 500, maxLightnessBps: 8500, a3MonochromeMaxBps: 1500 },
      reason: "Colour detection: A3 monochrome limit 10% to 15%. From a month of orders.",
    });
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByText(/orders already placed keep the reading/)).toBeVisible();
  });

  it("checks the figures before saving, and previews which inks count", () => {
    render(<ColourDetectionSettings settings={settings} canEdit />);
    const inks = screen.getByTestId("colour-sample-inks");
    expect(within(inks).getByText("Orange").parentElement).toHaveTextContent("Counts");
    expect(within(inks).getByText("Light grey").parentElement).toHaveTextContent("Not counted");
    fireEvent.change(screen.getByLabelText("Strong from saturation"), { target: { value: "0" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Saturation must be above 0%");
    expect(screen.getByRole("button", { name: "Save colour detection" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Strong from saturation"), { target: { value: "15" } });
    expect(within(inks).getByText("Muted tan").parentElement).toHaveTextContent("Counts");
  });

  it("reloads on a version conflict", async () => {
    mocks.updateSettings.mockRejectedValue(new ApiError(409, { error: "settings_version_conflict" }));
    const onConflict = vi.fn();
    render(<ColourDetectionSettings settings={settings} canEdit onConflict={onConflict} />);
    fireEvent.change(screen.getByLabelText("A3 monochrome limit"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save colour detection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save the new figures" }));
    expect(await screen.findByText(/Someone else saved settings a moment ago/)).toBeVisible();
    expect(onConflict).toHaveBeenCalled();
  });
});
