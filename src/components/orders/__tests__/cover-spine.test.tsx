// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { JobTicket } from "@/components/handover/FinishedReviewPanel";
import { CoverSpineRecord } from "@/components/orders/CoverSpineRecord";
import { FileCheckQueue } from "@/components/orders/FileCheckQueue";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { QualityReview } from "@/components/orders/QualityReview";
import { setTokenProvider } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { givenCoverSpine, hardboundLine, NOT_GIVEN_RECORD } from "@/test/cover-spine";

vi.stubGlobal("React", React);

const at = "2026-10-16T02:00:00.000Z";
const SUMMARY = "ABC-CS | Flood Risk Mapping of a River Basin | Sample Author | October 2026";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "book-order",
    clientId: "client",
    supplierId: "shop",
    riderId: null,
    title: "Thesis",
    state: "needs_qa",
    quantity: 3,
    size: "A4",
    deadline: null,
    address: "Delivery address on file",
    totalMinor: 150000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    productionItems: [hardboundLine()],
    createdAt: at,
    updatedAt: at,
    timeline: [],
    payoutMilestones: [],
    fileCheck: { status: "pending", requestedAt: at, reviewedAt: null, reason: null, waitingSeconds: 60 },
    ...overrides,
  } as unknown as Order;
}

const plain = () => order({ productionItems: [hardboundLine({ coverSpine: null })] });

const qualityReview = (value: Order) => (
  <QualityReview
    order={value}
    checked={{}}
    onCheck={() => {}}
    disabled={false}
    note=""
    onNote={() => {}}
    onRequestFile={() => {}}
  />
);

async function openSpecStep() {
  fireEvent.click(await screen.findByRole("button", { name: /^Show step \d+: .*spec/i }));
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setTokenProvider(() => "fixture-token");
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://gridgo.test").pathname;
    const body = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (path.endsWith("/download-url")) return body({ url: "https://files.test/fresh" });
    return body({ error: "not_found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
  vi.stubGlobal("React", React);
});

it("shows the cover, the spine top to bottom, and opens the separate cover page", async () => {
  const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
  const open = vi.fn(() => tab);
  vi.stubGlobal("open", open);
  render(<CoverSpineRecord order={order()} audience="shop" />);
  const record = screen.getByRole("region", { name: "Cover and spine" });
  expect(record).toHaveTextContent("CoverSeparate cover page");
  expect(record).toHaveTextContent("Institution codeABC-CS");
  expect(record).toHaveTextContent("TitleFlood Risk Mapping of a River Basin");
  expect(record).toHaveTextContent("AuthorSample Author");
  expect(record).toHaveTextContent("Month and yearOctober 2026");
  expect(record).toHaveTextContent("You work out the cover and spine sizes from the page count.");
  expect(within(record).getByTestId("spine-drawing")).toHaveTextContent(
    "ABC-CSFlood Risk Mapping of a River BasinSample AuthorOctober 2026",
  );
  fireEvent.click(within(record).getByRole("button", { name: "Open cover page" }));
  // The signed link that came with the order is still good: no second request.
  await waitFor(() => expect(tab.location.href).toBe("https://files.test/cover"));
  expect(tab.opener).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("asks for a fresh link when the order's has expired", async () => {
  const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
  vi.stubGlobal("open", vi.fn(() => tab));
  const line = hardboundLine({
    artworkAttachments: [{ kind: "file", fileId: "file_cover", label: "Cover" }],
  });
  render(<CoverSpineRecord order={order({ productionItems: [line] })} audience="staff" />);
  fireEvent.click(screen.getByRole("button", { name: "Open cover page" }));
  await waitFor(() => expect(tab.location.href).toBe("https://files.test/fresh"));
});

it("says Not given, names each item on a longer order, and skips other products", () => {
  render(
    <CoverSpineRecord
      order={order({
        productionItems: [
          hardboundLine({ coverSpine: NOT_GIVEN_RECORD }),
          hardboundLine({
            id: "line_2",
            itemName: "Report, hardbound",
            coverSpine: givenCoverSpine({ cover: "text_only", coverFileId: null }),
          }),
          hardboundLine({ id: "line_3", itemName: "Flyers", coverSpine: null }),
        ],
      })}
      audience="shop"
    />,
  );
  const missing = screen.getByRole("region", { name: "Cover and spine · Thesis, hardbound" });
  expect(missing).toHaveTextContent("Not given");
  expect(missing).toHaveTextContent("Ask the client before binding.");
  const lettered = screen.getByRole("region", { name: "Cover and spine · Report, hardbound" });
  expect(lettered).toHaveTextContent("Plain cover, text only");
  expect(lettered).toHaveTextContent("The front is lettered with the same details.");
  expect(within(lettered).queryByRole("button", { name: "Open cover page" })).toBeNull();
  expect(screen.queryByText(/Flyers/)).toBeNull();
});

it("draws nothing for other products and older orders", () => {
  const { container, rerender } = render(<CoverSpineRecord order={plain()} audience="staff" />);
  expect(container).toBeEmptyDOMElement();
  rerender(
    <CoverSpineRecord order={order({ productionItems: [hardboundLine({ coverSpine: undefined })] })} audience="staff" />,
  );
  expect(container).toBeEmptyDOMElement();
});

it("is part of the shop's job spec, and other jobs are unchanged", () => {
  const { unmount } = render(<OrderMeta order={order()} showMoney={false} fromJobDetails />);
  expect(screen.getByTestId("cover-spine-record")).toHaveTextContent("Separate cover page");
  unmount();
  render(<OrderMeta order={plain()} showMoney={false} fromJobDetails />);
  expect(screen.queryByTestId("cover-spine-record")).toBeNull();
});

it("adds the cover and spine to the quality check's comparison table", async () => {
  render(qualityReview(order()));
  await openSpecStep();
  const rows = await screen.findAllByTestId("cover-spine-row");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("CoverSeparate cover pageCover page on fileOpen cover pageCheck by eye");
  expect(rows[1]).toHaveTextContent(`Spine${SUMMARY}Lettered by the shopCheck by eye`);
  expect(screen.queryByText(/Something on this file is a problem/)).toBeNull();
});

it("adds no cover rows to the table for other products", async () => {
  render(qualityReview(plain()));
  await openSpecStep();
  expect(await screen.findByText("Specifications")).toBeInTheDocument();
  expect(screen.queryByTestId("cover-spine-row")).toBeNull();
});

it("shows the cover and spine in the Pass dialog", async () => {
  render(<FileCheckQueue orders={[order()]} onChanged={() => {}} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Pass" })[0]);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByTestId("cover-spine-record")).toHaveTextContent(
    "The shop works out the cover and spine sizes.",
  );
});

it("puts the cover and spine on the job ticket", () => {
  const { unmount } = render(<JobTicket order={order()} />);
  const ticket = screen.getByRole("complementary", { name: "Job ticket" });
  expect(within(ticket).getByText(`Cover: Separate cover page. Spine: ${SUMMARY}`)).toBeInTheDocument();
  unmount();
  render(<JobTicket order={order({ productionItems: [hardboundLine({ coverSpine: NOT_GIVEN_RECORD })] })} />);
  expect(screen.getByText("Cover and spine: Not given")).toBeInTheDocument();
});
