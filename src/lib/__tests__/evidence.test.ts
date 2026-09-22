import { describe, expect, it } from "vitest";

import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";
import {
  ARTWORK_SIZE_MISMATCH,
  artworkEvidence,
  artworkFileFacts,
  artworkSizeMismatchWarning,
  artworkSizeMismatchesProduct,
  detectedPrintSummary,
  fileLooksLikeImage,
  formatFileBytes,
  mockupEvidence,
  paymentProofEvidence,
} from "@/lib/evidence";

function record(
  partial: Partial<PaymentRecord> & Pick<PaymentRecord, "status">,
): PaymentRecord {
  return {
    amountMinor: 8000,
    method: "qr_manual",
    reference: null,
    submittedAt: null,
    confirmedAt: null,
    confirmedBy: null,
    confirmationSource: null,
    ...partial,
  };
}

describe("fileLooksLikeImage", () => {
  it("trusts jpeg from the client upload", () => {
    expect(
      fileLooksLikeImage({
        declaredContentType: "image/jpeg",
        originalFilename: "received_2134633887480308.jpeg",
      }),
    ).toBe(true);
  });

  it("falls back to the filename when type is missing", () => {
    expect(fileLooksLikeImage({ originalFilename: "proof.PNG" })).toBe(true);
    expect(fileLooksLikeImage({ originalFilename: "notes.pdf" })).toBe(false);
  });
});

describe("artwork metadata", () => {
  it("prints file size the way a print desk reads it", () => {
    expect(formatFileBytes(3 * 1024 * 1024)).toBe("3 MB");
    expect(formatFileBytes(420 * 1024)).toBe("420 KB");
    expect(formatFileBytes(512)).toBe("512 B");
  });

  it("leads with the named page size and DPI", () => {
    expect(
      detectedPrintSummary({
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
      }),
    ).toBe("A4 · 300 DPI");
  });

  it("falls back to millimetres when the size has no name", () => {
    expect(
      detectedPrintSummary({
        kind: "raster",
        pageCount: 1,
        pixelWidth: 1200,
        pixelHeight: 1200,
        dpi: 300,
        measureUnit: "mm",
        widthMilli: 101600,
        heightMilli: 101600,
        pageSize: null,
        orientation: "square",
      }),
    ).toBe("101.6 × 101.6 mm · 300 DPI");
  });

  it("carries the product size onto artwork evidence", () => {
    expect(
      artworkEvidence({
        artworkFileIds: ["file_art"],
        artworkName: "WorkHard.png",
        size: "A5",
      })[0].productSize,
    ).toBe("A5");
  });

  it("prefers the checkout line size and measurement over the order label", () => {
    const item = artworkEvidence({
      artworkFileIds: ["file_banner"],
      artworkName: "storefront.png",
      size: "",
      productionItems: [
        {
          id: "line1",
          itemName: "Tarpaulin",
          quantity: 1,
          measurement: { widthMilli: 3_000, heightMilli: 6_000, unit: "ft" },
          structuredSpec: { size: "3x6 ft" },
          artworkFileId: "file_banner",
        },
      ],
    })[0];
    expect(item.productSize).toBe("3x6 ft");
    expect(item.productMeasurement).toEqual({
      widthMilli: 3_000,
      heightMilli: 6_000,
      unit: "ft",
    });
  });

  it("joins print size, file size and created date for the plate", () => {
    expect(
      artworkFileFacts({
        size: 3 * 1024 * 1024,
        createdAt: "2026-09-15T10:00:00.000Z",
        detected: {
          kind: "raster",
          pageCount: 1,
          pixelWidth: 1200,
          pixelHeight: 1200,
          dpi: 300,
          measureUnit: "mm",
          widthMilli: 101600,
          heightMilli: 101600,
          pageSize: null,
          orientation: "square",
        },
      }),
    ).toEqual([
      "101.6 × 101.6 mm · 300 DPI",
      "3 MB",
      expect.stringMatching(/Sep/),
    ]);
  });
});

describe("artwork vs product size", () => {
  const screenshot = {
    kind: "raster" as const,
    pageCount: 1,
    pixelWidth: 720,
    pixelHeight: 1600,
    dpi: 96,
    measureUnit: "mm" as const,
    widthMilli: 190500,
    heightMilli: 423300,
    pageSize: null,
    orientation: "portrait" as const,
  };

  const a5 = {
    kind: "raster" as const,
    pageCount: 1,
    pixelWidth: 1748,
    pixelHeight: 2480,
    dpi: 300,
    measureUnit: "mm" as const,
    widthMilli: 148000,
    heightMilli: 210000,
    pageSize: "A5",
    orientation: "portrait" as const,
  };

  it("warns when a screenshot's millimetres are not the product size", () => {
    expect(artworkSizeMismatchesProduct(screenshot, "A5")).toBe(true);
    expect(artworkSizeMismatchWarning(screenshot, "A5")).toBe(ARTWORK_SIZE_MISMATCH);
  });

  it("compares banners, cards and stickers by their labelled sides", () => {
    expect(artworkSizeMismatchesProduct(screenshot, "3x6 ft")).toBe(true);
    expect(artworkSizeMismatchesProduct(screenshot, "3.5x2 in")).toBe(true);
    expect(artworkSizeMismatchesProduct(screenshot, "2x2 in")).toBe(true);
    expect(
      artworkSizeMismatchesProduct(
        {
          ...screenshot,
          widthMilli: 914400,
          heightMilli: 1828800,
          dpi: 100,
        },
        "3 × 6 ft",
      ),
    ).toBe(false);
    expect(
      artworkSizeMismatchesProduct(
        {
          ...screenshot,
          widthMilli: 88900,
          heightMilli: 50800,
          pageSize: null,
        },
        "3.5x2 in",
      ),
    ).toBe(false);
  });

  it("reads a tarpaulin the client typed rather than picked from a list", () => {
    const measurement = { widthMilli: 3_000, heightMilli: 5_000, unit: "ft" };
    expect(artworkSizeMismatchesProduct(screenshot, { measurement })).toBe(true);
    expect(
      artworkSizeMismatchesProduct(
        {
          ...screenshot,
          widthMilli: 914400,
          heightMilli: 1524000,
        },
        { measurement },
      ),
    ).toBe(false);
  });

  it("knows DL as well as the A-series", () => {
    expect(
      artworkSizeMismatchesProduct(
        {
          ...a5,
          pageSize: "DL",
          widthMilli: 99000,
          heightMilli: 210000,
        },
        "DL",
      ),
    ).toBe(false);
    expect(artworkSizeMismatchesProduct(a5, "DL")).toBe(true);
  });

  it("does not invent a size for apparel or an unmeasured custom", () => {
    expect(artworkSizeMismatchesProduct(screenshot, "M")).toBe(false);
    expect(artworkSizeMismatchesProduct(screenshot, "custom")).toBe(false);
    expect(artworkSizeMismatchesProduct(screenshot, "2x4")).toBe(false);
  });

  it("accepts the same named paper in either orientation", () => {
    expect(
      artworkSizeMismatchesProduct(
        { ...a5, orientation: "landscape", pageSize: "A5" },
        "A5",
      ),
    ).toBe(false);
    expect(
      artworkSizeMismatchesProduct(
        { ...a5, pageSize: null, widthMilli: 210000, heightMilli: 148000 },
        "A5 landscape",
      ),
    ).toBe(false);
  });

  it("warns when the file is a different named paper", () => {
    expect(
      artworkSizeMismatchesProduct(
        {
          ...a5,
          pageSize: "A4",
          widthMilli: 210000,
          heightMilli: 297000,
        },
        "A5",
      ),
    ).toBe(true);
  });

  it("stays quiet when either side cannot be measured", () => {
    expect(artworkSizeMismatchesProduct(null, "A5")).toBe(false);
    expect(artworkSizeMismatchesProduct(a5, null)).toBe(false);
    expect(
      artworkSizeMismatchesProduct(
        {
          ...screenshot,
          widthMilli: null,
          heightMilli: null,
          pageSize: null,
        },
        "A5",
      ),
    ).toBe(false);
  });
});

describe("order evidence", () => {
  it("lists artwork from checkout line ids", () => {
    const items = artworkEvidence({
      artworkFileIds: ["file_83727582e25d"],
      artworkName: "received_2134633887480308.jpeg",
    });
    expect(items).toEqual([
      {
        fileId: "file_83727582e25d",
        kind: "artwork",
        label: "Artwork",
        caption: "received_2134633887480308.jpeg",
        productSize: null,
        productMeasurement: null,
      },
    ]);
  });

  it("does not invent a mockup", () => {
    expect(mockupEvidence({})).toEqual([]);
  });

  it("finds a live API initial proof under the portal downpayment name", () => {
    const order = {
      payments: {
        initial: record({
          status: "pending_confirmation",
          reference: "12345678",
          proofFileId: "file_27082cae77cb",
        }),
      } as unknown as OrderPayments,
    } as Pick<Order, "payments">;
    expect(paymentProofEvidence(order)).toEqual([
      {
        fileId: "file_27082cae77cb",
        kind: "payment_proof",
        label: "Downpayment (75%) proof",
        caption: "12345678",
      },
    ]);
  });
});
