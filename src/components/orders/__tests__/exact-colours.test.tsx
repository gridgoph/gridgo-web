// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { JobTicket } from "@/components/handover/FinishedReviewPanel";
import { ExactColoursRecord } from "@/components/orders/ExactColours";
import { FileCheckQueue } from "@/components/orders/FileCheckQueue";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { QualityReview } from "@/components/orders/QualityReview";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { colourLine } from "@/test/exact-colours";

vi.stubGlobal("React", React);

const at = "2026-10-16T02:00:00.000Z";
const NAMES: Record<string, string> = {
  file_pdf: "shirt-front.pdf",
  file_png: "logo.png",
  file_jpg: "photo.jpg",
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "colour-order",
    clientId: "client",
    supplierId: "shop",
    riderId: null,
    title: "Club shirts",
    state: "needs_qa",
    quantity: 40,
    size: "Medium",
    deadline: null,
    address: "Delivery address on file",
    totalMinor: 400000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    productionItems: [colourLine()],
    createdAt: at,
    updatedAt: at,
    timeline: [],
    payoutMilestones: [],
    fileCheck: { status: "pending", requestedAt: at, reviewedAt: null, reason: null, waitingSeconds: 60 },
    ...overrides,
  } as unknown as Order;
}

/** The specification step of the QA checklist, opened. */
async function openSpecStep() {
  const step = await screen.findByRole("button", { name: /^Show step \d+: .*spec/i });
  fireEvent.click(step);
}

const plain = () => order({ productionItems: [colourLine({ colorTargets: [], artworkColors: [] })] });

beforeEach(() => {
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://gridgo.test").pathname;
      const body = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
      const file = path.match(/^\/files\/([^/]+)$/)?.[1];
      if (file && NAMES[file]) {
        return body({
          file: {
            fileId: file,
            purpose: "artwork",
            originalFilename: NAMES[file],
            declaredContentType: "application/pdf",
            detectedContentType: "application/pdf",
            size: 1000,
            ownerId: "client",
            state: "ready",
            createdAt: at,
            readyAt: at,
            deleteRequestedAt: null,
            deletedAt: null,
            references: [],
          },
        });
      }
      if (path.endsWith("/download-url")) return body({ url: "https://files.test/x" });
      return body({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

it("shows each colour as text with an honest swatch, and marks the files that state it exactly", async () => {
  render(<ExactColoursRecord order={order()} audience="shop" />);
  const record = screen.getByTestId("exact-colours");
  const rows = within(record).getAllByRole("listitem").slice(0, 4);
  expect(rows.map((row) => row.textContent)).toEqual([
    "≈ PMSSchool maroonPANTONE 201 CClient's approximate swatchIn Shirt front",
    "≈ CMYKBrand redC0 M100 Y65 K34Approximate on screenIn Shirt front",
    expect.stringMatching(/^HEXLogo blue#1A5FB4Screen colourIn (File 2|logo\.png)$/),
    "PMSCrest goldPANTONE 7406 CPantone code only, no swatch",
  ]);
  // The uploaded name replaces "File 2" once the file is read.
  expect(await within(rows[2]).findByText("In logo.png")).toBeInTheDocument();

  const chips = within(record).getAllByTestId("color-chip");
  expect(chips[0]).toHaveAttribute("data-swatch", "approximate");
  expect(chips[2]).toHaveAttribute("data-swatch", "exact");
  expect(chips[3]).toHaveAttribute("data-swatch", "none");

  const files = within(record).getAllByTestId("file-colours");
  expect(files).toHaveLength(3);
  expect(files[0]).toHaveTextContent("Shirt front");
  expect(files[0]).toHaveTextContent("PANTONE 201 CSpot colour");
  expect(files[0]).toHaveTextContent("Pictures placed in the PDF were not read.");
  expect(files[1]).toHaveTextContent("46% of the image");
  expect(await within(files[2]).findByText("photo.jpg")).toBeInTheDocument();
  expect(files[2]).toHaveTextContent(
    "We could not read the colours in this file.GRIDGO does not read colours from this file type.",
  );
  expect(record).toHaveTextContent("Work from the codes and values the client named.");
});

it("draws nothing for an order without colours", () => {
  const { container } = render(<ExactColoursRecord order={plain()} audience="staff" />);
  expect(container).toBeEmptyDOMElement();
});

it("is part of the shop's job spec, and a job without colours is unchanged", () => {
  const { unmount } = render(<OrderMeta order={order()} showMoney={false} fromJobDetails />);
  expect(screen.getByTestId("exact-colours")).toHaveTextContent("PANTONE 201 C");
  unmount();
  render(<OrderMeta order={plain()} showMoney={false} fromJobDetails />);
  expect(screen.queryByTestId("exact-colours")).toBeNull();
  expect(screen.queryByText(/Screens and printers/)).toBeNull();
});

it("puts the agreed colours on the job ticket", () => {
  render(<JobTicket order={order()} />);
  const ticket = screen.getByRole("complementary", { name: "Job ticket" });
  const colours = within(ticket).getByRole("list", { name: "Exact colours" });
  expect(within(colours).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
    "School maroon: PANTONE 201 C (Client's approximate swatch)",
    "Brand red: C0 M100 Y65 K34 (Approximate on screen)",
    "Logo blue: #1A5FB4 (Screen colour)",
    "Crest gold: PANTONE 7406 C (Pantone code only, no swatch)",
  ]);
});

it("compares each colour in the GRIDGO Team's specification table", async () => {
  render(
    <QualityReview
      order={order()}
      checked={{}}
      onCheck={() => {}}
      disabled={false}
      note=""
      onNote={() => {}}
      onRequestFile={() => {}}
    />,
  );
  await openSpecStep();
  const rows = await screen.findAllByTestId("colour-row");
  expect(rows).toHaveLength(4);
  await waitFor(() => expect(rows[2]).toHaveTextContent("In logo.png"));
  expect(rows[0]).toHaveTextContent("Colour: School maroonPANTONE 201 CClient's approximate swatchIn Shirt frontMatch");
  expect(rows[3]).toHaveTextContent("Colour: Crest goldPANTONE 7406 CPantone code only, no swatchNot stated exactly in the fileCheck by eye");
  expect(screen.getByTestId("read-colours")).toHaveTextContent("Colours GRIDGO read from the files");
  // An agreed colour no file states is for the eye, never a problem.
  expect(screen.queryByText(/Something on this file is a problem/)).toBeNull();
});

it("adds no colour rows to the table for an order without colours", async () => {
  render(
    <QualityReview
      order={plain()}
      checked={{}}
      onCheck={() => {}}
      disabled={false}
      note=""
      onNote={() => {}}
      onRequestFile={() => {}}
    />,
  );
  await openSpecStep();
  expect(await screen.findByText("Specifications")).toBeInTheDocument();
  expect(screen.queryByTestId("colour-row")).toBeNull();
  expect(screen.queryByTestId("read-colours")).toBeNull();
});

it("shows the colours in the Pass dialog, before the file goes to the shop", async () => {
  render(<FileCheckQueue orders={[order()]} onChanged={() => {}} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Pass" })[0]);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByTestId("exact-colours")).toHaveTextContent("C0 M100 Y65 K34");
  expect(within(dialog).getByTestId("exact-colours")).toHaveTextContent(
    "Check the file against the codes and values the client named.",
  );
});
