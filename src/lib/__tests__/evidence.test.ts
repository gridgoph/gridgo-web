import { describe, expect, it } from "vitest";

import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";
import {
  artworkEvidence,
  artworkFileFacts,
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
