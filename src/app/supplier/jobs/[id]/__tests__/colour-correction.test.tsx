// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";
import { shopColourQuote } from "@/test/colour-pricing";

const { getOrderMock, requestOrderChangeMock } = vi.hoisted(() => ({
  getOrderMock: vi.fn(),
  requestOrderChangeMock: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, getOrder: getOrderMock, requestOrderChange: requestOrderChangeMock };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";
import { ApiError } from "@/lib/api/client";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function job(partial: Partial<Order> = {}): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "shop_1",
    riderId: null,
    state: "production",
    title: "Site plans",
    deadline: "2026-10-01T08:00:00.000Z",
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    readyBy: "2026-10-20T08:00:00.000Z",
    supplierSubtotalMinor: 27_000,
    artworkName: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    timeline: [],
    productionItems: [
      {
        id: "line_1",
        itemName: "Whiteprint",
        quantity: 3,
        measurement: null,
        quantityMode: "document_sets",
        totalSheets: 6,
        colourPricing: shopColourQuote(),
      },
    ],
    changeRequests: [],
    ...partial,
  } as Order;
}

describe("the shop's colour reading on its job", { timeout: 20_000 }, () => {
  it("shows each page's strong colour, tier and the shop's own rate, never the client's", async () => {
    getOrderMock.mockResolvedValue(job());
    render(<SupplierJobDetailPage />);
    const record = await screen.findByTestId("colour-pricing-record");
    expect(within(record).getByText("3 sets × 2 pages = 6 sheets (sets of the whole document)")).toBeVisible();
    const rows = within(record).getAllByTestId("colour-page-row");
    expect(rows[1]).toHaveTextContent("Page 2");
    expect(rows[1]).toHaveTextContent("18%");
    expect(rows[1]).toHaveTextContent("Up to 25%");
    expect(rows[1]).toHaveTextContent("₱60.00");
    expect(within(record).queryByText(/Client \/ sheet|client all-in/)).not.toBeInTheDocument();
    expect(within(record).getByText("₱270.00")).toBeVisible();
  });

  it("sends a corrected page as a change request with the extra the server will derive", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(job());
    requestOrderChangeMock.mockResolvedValue({ id: "chg_1" });
    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Correct the colour price" }));
    const dialog = await screen.findByRole("dialog", { name: "Correct the colour price" });

    // A new reading in another tier takes the shop's rate for that tier.
    fireEvent.change(within(dialog).getByLabelText("Page 1 strong colour percent"), {
      target: { value: "20" },
    });
    expect(within(dialog).getByLabelText("Page 1 your price a sheet")).toHaveValue("60.00");
    expect(within(dialog).getAllByText("Up to 25%").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("₱90.00")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Review correction" }));
    expect(within(dialog).getByText("Tell the client why the job needs this change.")).toBeVisible();
    await user.type(
      within(dialog).getByLabelText("What did you see at print size?"),
      "Page 1 has an orange title block at print size.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Review correction" }));
    const confirm = await screen.findByRole("dialog", { name: "Send this colour correction?" });
    await user.click(within(confirm).getByRole("button", { name: "Send correction" }));

    await waitFor(() => expect(requestOrderChangeMock).toHaveBeenCalledTimes(1));
    const [orderId, body, key] = requestOrderChangeMock.mock.calls[0];
    expect(orderId).toBe("job-1");
    expect(typeof key).toBe("string");
    expect(body).toEqual({
      lineItemId: "line_1",
      reason: "Page 1 has an orange title block at print size.",
      colourCorrection: {
        pages: [
          { fileId: "file_pdf", page: 1, strongColourBps: 2000, sheetPriceMinor: 6000 },
          { fileId: "file_pdf", page: 2, strongColourBps: 1800, sheetPriceMinor: 6000 },
        ],
      },
      extraPrincipalMinor: 9000,
    });
  });

  it("refuses a lower total here and sends the shop to the GRIDGO Team for a refund", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(job());
    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Correct the colour price" }));
    const dialog = await screen.findByRole("dialog", { name: "Correct the colour price" });
    fireEvent.change(within(dialog).getByLabelText("Page 2 strong colour percent"), { target: { value: "0" } });
    await user.type(within(dialog).getByLabelText("What did you see at print size?"), "No colour at all.");
    await user.click(within(dialog).getByRole("button", { name: "Review correction" }));
    expect(within(dialog).getByText(/A lower price is a refund/)).toBeVisible();
    expect(requestOrderChangeMock).not.toHaveBeenCalled();
  });

  it("explains the server's refund refusal in the shop's words", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(job());
    requestOrderChangeMock.mockRejectedValue(
      new ApiError(409, { error: "colour_correction_refund_required" }),
    );
    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Correct the colour price" }));
    const dialog = await screen.findByRole("dialog", { name: "Correct the colour price" });
    fireEvent.change(within(dialog).getByLabelText("Page 2 your price a sheet"), { target: { value: "70" } });
    await user.type(within(dialog).getByLabelText("What did you see at print size?"), "Heavier fill.");
    await user.click(within(dialog).getByRole("button", { name: "Review correction" }));
    await user.click(await screen.findByRole("button", { name: "Send correction" }));
    expect(await screen.findByText(/contact the GRIDGO Team, who refund the client/)).toBeVisible();
  });

  it("offers no correction once the job is past ready", async () => {
    getOrderMock.mockResolvedValue(job({ state: "ready_for_dispatch" }));
    render(<SupplierJobDetailPage />);
    await screen.findByTestId("colour-pricing-record");
    expect(screen.queryByRole("button", { name: "Correct the colour price" })).not.toBeInTheDocument();
  });
});
