// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getOrder, transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "assigned-job" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual("@/lib/api/client")),
  getOrder: vi.fn(),
  transitionOrder: vi.fn(),
}));

const job: Order = {
  id: "assigned-job",
  state: "supplier_assigned",
  title: "Shop-priced print order",
  clientId: "client",
  supplierId: "shop",
  riderId: null,
  deadline: null,
  address: "Davao",
  supplierSubtotalMinor: 123456,
  supplierPriceMinor: 123456,
  subtotalMinor: 135802,
  totalMinor: 138302,
  deliveryFeeMinor: 2500,
  paymentMethod: null,
  paymentStatus: "unpaid",
  promisedDate: null,
  artworkName: null,
  timeline: [],
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(getOrder).mockResolvedValue(job);
  vi.mocked(transitionOrder).mockResolvedValue({ ...job, state: "awaiting_checkout" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openAcceptance() {
  const user = userEvent.setup();
  render(<SupplierJobDetailPage />);
  await user.click(await screen.findByRole("button", { name: "Accept and set price" }));
  return { user, price: screen.getByRole("textbox", { name: "Your price (₱)" }) };
}

it("opens with the shop price in pesos rather than the client subtotal or total", async () => {
  const { price } = await openAcceptance();
  expect(price).toHaveValue("1234.56");
  expect(price).not.toHaveAttribute("placeholder", "1000.00");
  expect(screen.getByText(/You will be paid ₱1,234.56/)).toBeInTheDocument();
});

it.each([
  { supplierSubtotalMinor: 123456, supplierPriceMinor: undefined },
  { supplierSubtotalMinor: 123456, supplierPriceMinor: 99999 },
  { supplierSubtotalMinor: undefined, supplierPriceMinor: 123456 },
])("uses the canonical shop price with an alias fallback: %j", async (money) => {
  vi.mocked(getOrder).mockResolvedValue({ ...job, ...money });
  const { price } = await openAcceptance();
  expect(price).toHaveValue("1234.56");
});

it("leaves an unknown shop price blank without substituting client money", async () => {
  vi.mocked(getOrder).mockResolvedValue({
    ...job,
    supplierSubtotalMinor: undefined,
    supplierPriceMinor: undefined,
  });
  const { price, user } = await openAcceptance();
  expect(price).toHaveValue("");
  expect(price).not.toHaveAttribute("placeholder", "1000.00");
  await user.click(screen.getByRole("button", { name: "Accept and tell the client" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter your price in pesos");
  expect(transitionOrder).not.toHaveBeenCalled();
});

it("keeps the price editable and sends the shop subtotal in minor units", async () => {
  const { price, user } = await openAcceptance();
  await user.clear(price);
  await user.type(price, "1456.78");
  expect(screen.getByText(/You will be paid ₱1,456.78/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Accept and tell the client" }));
  await waitFor(() =>
    expect(transitionOrder).toHaveBeenCalledWith(job.id, "supplier_accepted", {
      supplierSubtotalMinor: 145678,
      promisedDate: undefined,
      note: "Accepted and priced",
    }),
  );
});

it("submits the prefilled amount without requiring the shop to retype it", async () => {
  const { user } = await openAcceptance();
  await user.click(screen.getByRole("button", { name: "Accept and tell the client" }));
  expect(transitionOrder).toHaveBeenCalledWith(job.id, "supplier_accepted", {
    supplierSubtotalMinor: 123456,
    promisedDate: undefined,
    note: "Accepted and priced",
  });
});

it("starts again from the job price after cancelling an edit", async () => {
  const { price, user } = await openAcceptance();
  await user.clear(price);
  await user.type(price, "1456.78");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Accept and set price" }));
  expect(screen.getByRole("textbox", { name: "Your price (₱)" })).toHaveValue("1234.56");
  expect(transitionOrder).not.toHaveBeenCalled();
});
