// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getFile = vi.hoisted(() => vi.fn());
const getFileDownloadUrl = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", () => ({
  getFile: (...args: unknown[]) => getFile(...args),
  getFileDownloadUrl: (...args: unknown[]) => getFileDownloadUrl(...args),
}));

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import type { StoredFile } from "@/lib/api/types";

afterEach(() => {
  cleanup();
  getFile.mockReset();
  getFileDownloadUrl.mockReset();
});

function artworkFile(partial: Partial<StoredFile> = {}): StoredFile {
  return {
    fileId: "file_art",
    purpose: "artwork",
    originalFilename: "flyers.jpg",
    declaredContentType: "image/jpeg",
    detectedContentType: "image/jpeg",
    size: 3 * 1024 * 1024,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-09-15T10:00:00.000Z",
    readyAt: "2026-09-15T10:00:01.000Z",
    deleteRequestedAt: null,
    deletedAt: null,
    references: [],
    detected: {
      kind: "raster",
      pageCount: 1,
      pixelWidth: 2480,
      pixelHeight: 3508,
      dpi: 300,
      measureUnit: "mm",
      widthMilli: 210000,
      heightMilli: 297000,
      pageSize: "A4",
      orientation: "portrait",
    },
    ...partial,
  };
}

describe("EvidencePlate artwork metadata", () => {
  it("puts print size, file size and created date under the artwork", async () => {
    getFile.mockResolvedValue(artworkFile());
    getFileDownloadUrl.mockResolvedValue("https://files.test/flyers.jpg");
    render(
      <EvidencePlate
        fileId="file_art"
        label="Artwork"
        caption="flyers.jpg"
        showMetadata
      />,
    );
    expect(await screen.findByRole("img", { name: "flyers.jpg" })).toBeInTheDocument();
    expect(screen.getByText(/A4 · 300 DPI/)).toBeInTheDocument();
    expect(screen.getByText(/3 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Sep/)).toBeInTheDocument();
  });

  it("does not invent metadata on a proof plate", async () => {
    getFile.mockResolvedValue(
      artworkFile({
        fileId: "file_proof",
        purpose: "payment_proof",
        originalFilename: "receipt.jpg",
        declaredContentType: "image/jpeg",
        detectedContentType: "image/jpeg",
        detected: undefined,
      }),
    );
    getFileDownloadUrl.mockResolvedValue("https://files.test/receipt.jpg");
    render(<EvidencePlate fileId="file_proof" label="QR proof" />);
    expect(await screen.findByRole("img", { name: "receipt.jpg" })).toBeInTheDocument();
    expect(screen.queryByText(/DPI/)).toBeNull();
    expect(screen.queryByText(/3 MB/)).toBeNull();
  });

  it("warns when the file millimetres are not the product size", async () => {
    getFile.mockResolvedValue(
      artworkFile({
        originalFilename: "WorkHard.png",
        detected: {
          kind: "raster",
          pageCount: 1,
          pixelWidth: 720,
          pixelHeight: 1600,
          dpi: 96,
          measureUnit: "mm",
          widthMilli: 190500,
          heightMilli: 423300,
          pageSize: null,
          orientation: "portrait",
        },
      }),
    );
    getFileDownloadUrl.mockResolvedValue("https://files.test/WorkHard.png");
    render(
      <EvidencePlate
        fileId="file_art"
        label="Artwork"
        caption="WorkHard.png"
        showMetadata
        productSize="A5"
      />,
    );
    expect(await screen.findByRole("img", { name: "WorkHard.png" })).toBeInTheDocument();
    expect(screen.getByText(/190\.5 × 423\.3 mm · 96 DPI/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "File size not match on the product size",
    );
  });

  it("warns when a banner file is not the ordered feet", async () => {
    getFile.mockResolvedValue(
      artworkFile({
        originalFilename: "storefront.png",
        detected: {
          kind: "raster",
          pageCount: 1,
          pixelWidth: 720,
          pixelHeight: 1600,
          dpi: 96,
          measureUnit: "mm",
          widthMilli: 190500,
          heightMilli: 423300,
          pageSize: null,
          orientation: "portrait",
        },
      }),
    );
    getFileDownloadUrl.mockResolvedValue("https://files.test/storefront.png");
    render(
      <EvidencePlate
        fileId="file_art"
        label="Artwork"
        caption="storefront.png"
        showMetadata
        productSize="3x6 ft"
      />,
    );
    expect(await screen.findByRole("img", { name: "storefront.png" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "File size not match on the product size",
    );
  });

  it("does not warn when the file is the product paper", async () => {
    getFile.mockResolvedValue(artworkFile());
    getFileDownloadUrl.mockResolvedValue("https://files.test/flyers.jpg");
    render(
      <EvidencePlate
        fileId="file_art"
        label="Artwork"
        caption="flyers.jpg"
        showMetadata
        productSize="A4"
      />,
    );
    expect(await screen.findByRole("img", { name: "flyers.jpg" })).toBeInTheDocument();
    expect(screen.queryByText("File size not match on the product size")).toBeNull();
  });
});
