// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getOrder, transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";

// Regression for gridgoph/gridgo-web#57: the price a shop sees when it accepts
// is its own price — the canonical `supplierSubtotalMinor`, falling back to the
// `supplierPriceMinor` alias — never the client's subtotal or total. Accepting
// is a confirmation now (no price field), so the guard is on what is shown.

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
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows the shop price rather than the client subtotal or total", async () => {
  render(<SupplierJobDetailPage />);
  expect(await screen.findByText("Price: ₱1,234.56")).toBeInTheDocument();
  expect(screen.queryByText(/₱1,358\.02/)).not.toBeInTheDocument();
  expect(screen.queryByText(/₱1,383\.02/)).not.toBeInTheDocument();
});

it.each([
  { supplierSubtotalMinor: 123456, supplierPriceMinor: undefined },
  { supplierSubtotalMinor: 123456, supplierPriceMinor: 99999 },
  { supplierSubtotalMinor: undefined, supplierPriceMinor: 123456 },
])("uses the canonical shop price with an alias fallback: %j", async (money) => {
  vi.mocked(getOrder).mockResolvedValue({ ...job, ...money });
  render(<SupplierJobDetailPage />);
  expect(await screen.findByText("Price: ₱1,234.56")).toBeInTheDocument();
});

it("names no figure for an unknown shop price instead of substituting client money", async () => {
  vi.mocked(getOrder).mockResolvedValue({
    ...job,
    supplierSubtotalMinor: undefined,
    supplierPriceMinor: undefined,
  });
  render(<SupplierJobDetailPage />);
  expect(await screen.findByText("Price already set on your board")).toBeInTheDocument();
  expect(screen.queryByText(/₱/)).not.toBeInTheDocument();
  expect(transitionOrder).not.toHaveBeenCalled();
});
