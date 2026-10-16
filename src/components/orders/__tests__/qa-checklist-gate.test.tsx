// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { QaChecklistFields } from "@/components/orders/QaChecklist";
import { QualityReview } from "@/components/orders/QualityReview";
import { getFile, recordQaTick } from "@/lib/api/client";
import type { Order, StoredFile } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", () => ({
  getFile: vi.fn(),
  getFileDownloadUrl: vi.fn(() => new Promise(() => {})),
  recordQaTick: vi.fn(async () => {}),
  downloadOrderArtwork: vi.fn(),
  postQaClientAction: vi.fn(),
}));

const order = {
  id: "order_1",
  size: "A5",
  material: "C2S 300",
  finish: "Matte laminate",
  quantity: 100,
  unit: "piece",
  subtotalMinor: 150000,
  totalMinor: 180000,
  address: "12 Quimpo Blvd, Davao City",
  artworkFileIds: ["file_1"],
  productionItems: [{ id: "line", quantity: 100, measurement: { pages: 2 } }],
} as Order;

const detected: StoredFile["detected"] = {
  kind: "pdf",
  pageCount: 2,
  pixelWidth: null,
  pixelHeight: null,
  dpi: null,
  measureUnit: "mm",
  widthMilli: 148000,
  heightMilli: 210000,
  pageSize: "A5",
  orientation: "portrait",
  colorMode: "cmyk",
  fonts: [{ name: "Arial", embedded: true }],
  bleedMilli: 3000,
  hasAlpha: null,
};

function stored(): StoredFile {
  return {
    fileId: "file_1",
    purpose: "artwork",
    originalFilename: "flyer.pdf",
    declaredContentType: "application/pdf",
    detectedContentType: "application/pdf",
    size: 1000,
    ownerId: "client",
    state: "ready",
    createdAt: "2026-10-15T02:00:00.000Z",
    readyAt: "2026-10-15T02:00:00.000Z",
    deleteRequestedAt: null,
    deletedAt: null,
    references: [],
    detected,
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.mocked(getFile).mockReset();
  vi.mocked(recordQaTick).mockReset();
  vi.mocked(recordQaTick).mockResolvedValue(undefined);
});

it("keeps a check untickable until its panel has loaded, and after a failed load", async () => {
  const onCheck = vi.fn();
  const panels = { artwork: "loading" as const, spec: "ready" as const, quantity: "ready" as const, address: "ready" as const };
  const { rerender } = render(
    <QaChecklistFields order={order} checked={{}} onCheck={onCheck} disabled={false} panels={panels} />,
  );
  const user = userEvent.setup();
  const waiting = screen.getByRole("checkbox", { name: "Artwork is print-ready" });
  expect(waiting).toBeDisabled();
  await user.click(waiting);
  expect(onCheck).not.toHaveBeenCalled();

  rerender(
    <QaChecklistFields
      order={order}
      checked={{}}
      onCheck={onCheck}
      disabled={false}
      panels={{ ...panels, artwork: "failed" }}
    />,
  );
  expect(screen.getByText("Could not load this check, so it cannot be ticked.")).toBeInTheDocument();
  const failed = screen.getByRole("checkbox", { name: /Artwork is print-ready/ });
  expect(failed).toBeDisabled();
  await user.click(failed);
  expect(onCheck).not.toHaveBeenCalled();

  rerender(
    <QaChecklistFields
      order={order}
      checked={{}}
      onCheck={onCheck}
      disabled={false}
      panels={{ ...panels, artwork: "ready" }}
    />,
  );
  const ready = screen.getByRole("checkbox", { name: "Artwork is print-ready" });
  expect(ready).toBeEnabled();
  await user.click(ready);
  expect(onCheck).toHaveBeenCalledWith({ artwork: true });
});

it("shows the stored file facts once the artwork has loaded, and not before the tick", async () => {
  const user = userEvent.setup();
  let release: (file: StoredFile) => void = () => {};
  vi.mocked(getFile).mockImplementation(
    () => new Promise<StoredFile>((resolve) => {
      release = resolve;
    }),
  );
  const onCheck = vi.fn();
  render(
    <QualityReview
      order={order}
      checked={{}}
      onCheck={onCheck}
      disabled={false}
      note=""
      onNote={() => {}}
      onRequestFile={() => {}}
    />,
  );
  const waiting = screen.getByRole("checkbox", { name: "Artwork is print-ready" });
  expect(waiting).toBeDisabled();
  await user.click(waiting);
  expect(recordQaTick).not.toHaveBeenCalled();

  release(stored());
  await waitFor(() => expect(screen.getByText("CMYK")).toBeInTheDocument());
  expect(screen.getByText("3 mm")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Artwork is print-ready" })).toBeEnabled();
  await user.click(screen.getByRole("checkbox", { name: "Artwork is print-ready" }));
  await waitFor(() => expect(recordQaTick).toHaveBeenCalledWith("order_1", "artwork", true));
  expect(onCheck).toHaveBeenCalledWith(expect.objectContaining({ artwork: true }));
});

it("keeps one quality step open, and opens the next step after that check is ticked", async () => {
  const user = userEvent.setup();
  vi.mocked(getFile).mockResolvedValue(stored());
  const { rerender } = render(
    <QualityReview
      order={order}
      checked={{}}
      onCheck={() => {}}
      disabled={false}
      note=""
      onNote={() => {}}
      onRequestFile={() => {}}
    />,
  );
  await waitFor(() => expect(screen.getByText("CMYK")).toBeInTheDocument());
  expect(screen.queryByText("No special instructions on this order.")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Show step 2: Specifications match the order" }));
  expect(screen.getByText("No special instructions on this order.")).toBeInTheDocument();
  expect(screen.queryByText("CMYK")).not.toBeInTheDocument();

  rerender(
    <QualityReview
      order={order}
      checked={{ artwork: true }}
      onCheck={() => {}}
      disabled={false}
      note=""
      onNote={() => {}}
      onRequestFile={() => {}}
    />,
  );
  expect(screen.getByText("No special instructions on this order.")).toBeInTheDocument();
  expect(screen.queryByText("CMYK")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Artwork is print-ready" })).toBeChecked();
});
