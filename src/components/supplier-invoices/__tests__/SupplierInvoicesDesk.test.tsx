// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierInvoice, SupplierInvoiceMonth } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  listSupplierInvoices: vi.fn(),
  getSupplierInvoice: vi.fn(),
  collectSupplierInvoice: vi.fn(),
  listOrders: vi.fn(),
  getFile: vi.fn(),
  getFileDownloadUrl: vi.fn(),
  getUser: vi.fn(),
}));

/** A URL the desk can write to and re-render from, like the App Router's. */
const url = vi.hoisted(() => {
  let query = "";
  const listeners = new Set<() => void>();
  return {
    get: () => query,
    set: (next: string) => {
      query = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.stubGlobal("React", React);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: (href: string) => url.set(href.split("?")[1] ?? ""),
    }),
    usePathname: () => "/admin/supplier-invoices",
    useSearchParams: () => {
      const query = useSyncExternalStore(url.subscribe, url.get, url.get);
      return useMemo(() => new URLSearchParams(query), [query]);
    },
  };
});

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "admin_me", name: "Admin", email: "", role: "super_admin" } }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { ApiError } from "@/lib/api/client";
import { SupplierInvoicesDesk } from "@/components/supplier-invoices/SupplierInvoicesDesk";
import { SupplierInvoicesSummary } from "@/components/supplier-invoices/SupplierInvoicesSummary";

function invoice(patch: Partial<SupplierInvoice>): SupplierInvoice {
  return {
    orderId: "order_1",
    supplierId: "shop_a",
    expectedAt: "2026-10-03T02:00:00.000Z",
    month: "2026-10",
    fileId: null,
    number: null,
    date: null,
    amountMinor: null,
    submittedAt: null,
    updatedAt: null,
    version: 0,
    collectedAt: null,
    collectedBy: null,
    scanFileIds: [],
    received: false,
    collected: false,
    ...patch,
  };
}

const scannedA = invoice({
  orderId: "order_1",
  fileId: "file_1",
  number: "INV-001",
  date: "2026-10-01",
  amountMinor: 125000,
  submittedAt: "2026-10-03T03:00:00.000Z",
  updatedAt: "2026-10-03T03:00:00.000Z",
  version: 1,
  scanFileIds: ["file_1"],
  received: true,
});
const missingA = invoice({ orderId: "order_2" });
const collectedB = invoice({
  orderId: "order_3",
  supplierId: "shop_b",
  fileId: "file_3",
  number: "B-77",
  date: "2026-10-02",
  amountMinor: 50000,
  submittedAt: "2026-10-03T03:00:00.000Z",
  updatedAt: "2026-10-05T03:00:00.000Z",
  version: 2,
  scanFileIds: ["file_3"],
  received: true,
  collected: true,
  collectedAt: "2026-10-05T03:00:00.000Z",
  collectedBy: "admin_me",
});

const october: SupplierInvoiceMonth = {
  month: "2026-10",
  reminder: "Do not put your shop invoice inside the printed products.",
  totals: { expected: 3, received: 2, missing: 1, collected: 1, toCollect: 2 },
  shops: [
    { supplierId: "shop_a", shopName: "Shop A", expected: 2, received: 1, missing: 1, collected: 0, toCollect: 2 },
    { supplierId: "shop_b", shopName: "Shop B", expected: 1, received: 1, missing: 0, collected: 1, toCollect: 0 },
  ],
  invoices: [scannedA, missingA, collectedB],
  nextCursor: null,
};

beforeEach(() => {
  // jsdom has no layout; the shop action scrolls to the invoice list.
  Element.prototype.scrollIntoView = vi.fn();
  url.set("month=2026-10");
  api.listSupplierInvoices.mockResolvedValue(october);
  api.listOrders.mockResolvedValue([
    { id: "order_1", title: "Flyers A5" },
    { id: "order_2", title: "Tarpaulin 3x6" },
    { id: "order_3", title: "Calling cards" },
  ]);
  api.getFile.mockResolvedValue({
    fileId: "file_1",
    originalFilename: "invoice-001.png",
    detectedContentType: "image/png",
    state: "ready",
  });
  api.getFileDownloadUrl.mockResolvedValue("https://files.example/invoice-001.png");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function invoiceTable() {
  return screen.getByRole("table", { name: /Supplier invoices, October 2026/ });
}

describe("SupplierInvoicesDesk", () => {
  it("leads with the originals still to collect and counts every shop", async () => {
    render(<SupplierInvoicesDesk tree="admin" />);

    expect(
      await screen.findByText("2 of 3 originals still to collect from 2 shops"),
    ).toBeInTheDocument();
    expect(api.listSupplierInvoices).toHaveBeenCalledWith("2026-10", { limit: 100 });
    expect(
      screen.getAllByRole("img", {
        name: "3 expected, 2 scanned in, 1 missing a scan, 1 original collected, 2 still to collect",
      }).length,
    ).toBeGreaterThan(0);
    const shops = screen.getByRole("table", { name: /by shop/ });
    const rows = within(shops).getAllByRole("row").slice(1);
    // Shop A has paper to pick up, so it comes first.
    expect(rows[0]).toHaveTextContent("Shop A");
    expect(rows[1]).toHaveTextContent("Shop B");
  });

  it("reads every page of the month before showing it", async () => {
    api.listSupplierInvoices
      .mockResolvedValueOnce({ ...october, invoices: [scannedA], nextCursor: "order_1" })
      .mockResolvedValueOnce({ ...october, invoices: [missingA, collectedB], nextCursor: null });
    render(<SupplierInvoicesDesk tree="admin" />);

    await within(await screen.findByRole("table", { name: /Supplier invoices, October/ })).findByText(
      "Calling cards",
    );
    expect(api.listSupplierInvoices).toHaveBeenNthCalledWith(2, "2026-10", {
      limit: 100,
      after: "order_1",
    });
  });

  it("filters to the paper still to collect, and to one shop", async () => {
    const user = userEvent.setup();
    render(<SupplierInvoicesDesk tree="admin" />);
    await within(await screen.findByRole("table", { name: /Supplier invoices, October/ })).findByText(
      "Calling cards",
    );

    await user.click(screen.getByRole("button", { name: "Original to collect · 2" }));
    expect(url.get()).toContain("view=to_collect");
    await waitFor(() =>
      expect(within(invoiceTable()).queryByText("Calling cards")).not.toBeInTheDocument(),
    );
    expect(within(invoiceTable()).getByText("Flyers A5")).toBeInTheDocument();
    expect(within(invoiceTable()).getByText("Tarpaulin 3x6")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Missing scan · 1" }));
    await waitFor(() =>
      expect(within(invoiceTable()).queryByText("Flyers A5")).not.toBeInTheDocument(),
    );
    expect(within(invoiceTable()).getByText("No scan yet")).toBeInTheDocument();

    // The table and its phone cards both carry the action.
    await user.click(screen.getAllByRole("button", { name: "Show Shop B's invoices" })[0]);
    expect(url.get()).toContain("shop=shop_b");
    expect(await screen.findByRole("heading", { name: "Shop B's invoices" })).toBeInTheDocument();
    expect(screen.getByText("Every scan is in")).toBeInTheDocument();
  });

  it("opens an invoice with its scan and records the original after a confirmation", async () => {
    const user = userEvent.setup();
    const collectedA = {
      ...scannedA,
      version: 2,
      collected: true,
      collectedAt: "2026-10-06T01:00:00.000Z",
      collectedBy: "admin_me",
    };
    api.collectSupplierInvoice.mockResolvedValue({ invoice: collectedA, reminder: october.reminder });
    render(<SupplierInvoicesDesk tree="admin" />);
    const table = await screen.findByRole("table", { name: /Supplier invoices, October/ });
    await within(table).findByText("Flyers A5");

    const row = within(table).getByText("Flyers A5").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Open invoice" }));
    expect(url.get()).toContain("order=order_1");

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("INV-001")).toBeInTheDocument();
    expect(within(sheet).getByText("₱1,250.00")).toBeInTheDocument();
    expect(await within(sheet).findByRole("button", { name: /Open Invoice scan/ })).toBeInTheDocument();
    expect(within(sheet).getByText("Open the order").closest("a")).toHaveAttribute(
      "href",
      "/admin/orders/order_1",
    );

    await user.click(within(sheet).getByRole("button", { name: "Mark original collected" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Shop A’s invoice INV-001 for Flyers A5");
    expect(confirm).toHaveTextContent("This cannot be undone");
    expect(api.collectSupplierInvoice).not.toHaveBeenCalled();

    // The desk re-reads the month after the write; the API now counts it.
    api.listSupplierInvoices.mockResolvedValue({
      ...october,
      totals: { ...october.totals, collected: 2, toCollect: 1 },
      invoices: [collectedA, missingA, collectedB],
    });
    await user.click(within(confirm).getByRole("button", { name: "Mark collected" }));
    expect(api.collectSupplierInvoice).toHaveBeenCalledWith("order_1", 1);
    expect(await screen.findByText("1 of 3 originals still to collect from 2 shops")).toBeInTheDocument();
    expect(await screen.findByText(/Collected .* by you\./)).toBeInTheDocument();
  });

  it("explains why an invoice without a scan cannot be marked collected", async () => {
    const user = userEvent.setup();
    url.set("month=2026-10&order=order_2");
    render(<SupplierInvoicesDesk tree="ops" />);

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Nothing entered yet.")).toBeInTheDocument();
    expect(within(sheet).getByText(/scan and invoice details come first/)).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Mark original collected" })).toBeNull();
    expect(within(sheet).getByText("Open the order").closest("a")).toHaveAttribute(
      "href",
      "/ops/orders/order_2",
    );

    await user.keyboard("{Escape}");
    await waitFor(() => expect(url.get()).not.toContain("order="));
    const row = within(invoiceTable()).getByText("Tarpaulin 3x6").closest("tr") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Mark original collected" })).toBeNull();
  });

  it("re-reads the month when the shop changed the invoice first", async () => {
    const user = userEvent.setup();
    api.collectSupplierInvoice.mockRejectedValue(
      new ApiError(409, { error: "supplier_invoice_version_conflict" }),
    );
    render(<SupplierInvoicesDesk tree="admin" />);
    const table = await screen.findByRole("table", { name: /Supplier invoices, October/ });
    const row = (await within(table).findByText("Flyers A5")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Mark original collected" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Mark collected" }));

    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "The shop changed this invoice a moment ago",
    );
    await waitFor(() => expect(api.listSupplierInvoices).toHaveBeenCalledTimes(2));
  });

  it("follows an inbox link to the month the invoice counts in", async () => {
    url.set("order=order_9");
    api.getSupplierInvoice.mockResolvedValue({
      invoice: invoice({ orderId: "order_9", month: "2026-08", expectedAt: "2026-08-12T02:00:00.000Z" }),
      reminder: october.reminder,
    });
    api.listSupplierInvoices.mockImplementation(async (month: string) =>
      month === "2026-08"
        ? {
            ...october,
            month,
            totals: { expected: 1, received: 0, missing: 1, collected: 0, toCollect: 1 },
            shops: [october.shops[0]],
            invoices: [
              invoice({ orderId: "order_9", month: "2026-08", expectedAt: "2026-08-12T02:00:00.000Z" }),
            ],
          }
        : { ...october, invoices: [] },
    );
    render(<SupplierInvoicesDesk tree="admin" />);

    await waitFor(() => expect(url.get()).toContain("month=2026-08"));
    expect(await screen.findByText("August 2026")).toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toHaveTextContent("so it counts in August 2026");
  });

  it("says plainly when a month has no invoices and offers the month before", async () => {
    const user = userEvent.setup();
    api.listSupplierInvoices.mockResolvedValue({
      ...october,
      totals: { expected: 0, received: 0, missing: 0, collected: 0, toCollect: 0 },
      shops: [],
      invoices: [],
    });
    render(<SupplierInvoicesDesk tree="admin" />);

    expect(await screen.findByText("No invoices expected for October 2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "September 2026" }));
    expect(url.get()).toContain("month=2026-09");
  });

  it("shows recovery copy when the month cannot be read", async () => {
    api.listSupplierInvoices.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    await act(async () => {
      render(<SupplierInvoicesDesk tree="ops" />);
    });
    expect(
      await screen.findByText("Only Operations and Super Admin can see supplier invoices."),
    ).toBeInTheDocument();
  });
});

describe("SupplierInvoicesSummary on Finance", () => {
  it("reads only this month's totals and links to the desk", async () => {
    render(<SupplierInvoicesSummary tree="admin" />);

    expect(
      await screen.findByText(
        "3 expected, 2 scanned in, 1 missing a scan, 1 original collected, 2 still to collect.",
      ),
    ).toBeInTheDocument();
    expect(api.listSupplierInvoices).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/), {
      limit: 1,
    });
    expect(screen.getByText("Open supplier invoices").closest("a")).toHaveAttribute(
      "href",
      "/admin/supplier-invoices",
    );
  });
});
