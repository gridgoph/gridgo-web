// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));

const SENT_AT = "2026-11-02T03:00:00.000Z";
const NO_SCAN = { attached: false, fileIds: [], latestFileId: null, latestUploadedAt: null };

function fixture(patch: Partial<Order> = {}): Order {
  return {
    id: "order1",
    clientId: "client1",
    supplierId: "shop1",
    riderId: null,
    state: "production",
    title: "Flyers",
    quantity: 2,
    deadline: null,
    address: "Davao",
    totalMinor: 10000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    createdAt: SENT_AT,
    updatedAt: SENT_AT,
    timeline: [],
    ...patch,
  };
}

let order: Order;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      const file = path.match(/\/files\/([^/]+)(\/download-url)?$/);
      if (file) {
        if (file[2]) return json({ url: `https://storage.test/${file[1]}.png` });
        return json({
          file: {
            fileId: file[1],
            purpose: "supplier_invoice",
            originalFilename: `${file[1]}.png`,
            declaredContentType: "image/png",
            detectedContentType: "image/png",
            size: 1000,
            ownerId: "shop1",
            state: "ready",
            createdAt: SENT_AT,
            readyAt: SENT_AT,
            deleteRequestedAt: null,
            deletedAt: null,
            references: [],
          },
        });
      }
      return json({ order });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

async function openRow() {
  const trigger = await screen.findByRole("button", { name: /^Receipt scan/ });
  await userEvent.click(trigger);
  return trigger;
}

it("shows the latest scan with its time, earlier scans and the invoices desk", async () => {
  order = fixture({
    receiptScan: {
      attached: true,
      fileIds: ["file_a", "file_b"],
      latestFileId: "file_b",
      latestUploadedAt: SENT_AT,
    },
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const trigger = await openRow();
  expect(trigger).toHaveTextContent(`Attached, sent ${formatDateTime(SENT_AT)}. 2 scans on the order.`);
  expect(await screen.findByRole("img", { name: "file_b.png" })).toHaveAttribute(
    "src",
    "https://storage.test/file_b.png",
  );
  expect(screen.getByText(`Sent ${formatDateTime(SENT_AT)}`)).toBeInTheDocument();
  expect(screen.getByText("1 earlier scan")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "open Supplier invoices" })).toHaveAttribute(
    "href",
    "/ops/supplier-invoices?order=order1",
  );
});

it("says plainly when the switch holds the rider call for a missing scan", async () => {
  order = fixture({
    receiptScan: NO_SCAN,
    transitionReadiness: {
      ready_for_dispatch: {
        allowed: false,
        missing: [{ code: "receipt_scan_required", message: "Attach the receipt scan." }],
        receiptScan: { required: true, attached: false },
      },
    },
  });
  render(<OrderWorkspace queueHref="/ops/orders" />);

  const trigger = await openRow();
  expect(trigger).toHaveTextContent("Missing. The shop cannot call a rider until it sends one.");
  expect(await screen.findByTestId("receipt-scan-holding")).toHaveTextContent(
    "The shop cannot mark this job ready for rider pickup until it sends its receipt scan.",
  );
});

it("shows a forced step that went past the missing scan as skipped", async () => {
  const forcedAt = "2026-11-02T04:00:00.000Z";
  order = fixture({
    state: "ready_for_dispatch",
    receiptScan: NO_SCAN,
    forcedSteps: [
      {
        at: forcedAt,
        by: "ops1",
        role: "ops_admin",
        from: "production",
        to: "ready_for_dispatch",
        reasonCode: "shop_cannot_upload",
        note: "Shop phone is broken",
        skippedChecks: ["receipt_scan_required"],
      },
    ],
    forcedByGridgo: true,
  });
  render(<OrderWorkspace queueHref="/admin/orders" />);

  const trigger = await openRow();
  expect(trigger).toHaveTextContent("Skipped. GRIDGO moved the job on without one.");
  const panel = within(await screen.findByTestId("receipt-scan-skipped"));
  expect(panel.getByText(new RegExp(`moved this job on ${formatDateTime(forcedAt)}`))).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "open Supplier invoices" })).toHaveAttribute(
    "href",
    "/admin/supplier-invoices?order=order1",
  );
});

it("leaves the row out on an API that sends no scans", async () => {
  order = fixture();
  render(<OrderWorkspace queueHref="/ops/orders" />);
  await screen.findByRole("heading", { name: "Flyers", level: 1 });
  expect(screen.queryByRole("button", { name: /^Receipt scan/ })).not.toBeInTheDocument();
});
