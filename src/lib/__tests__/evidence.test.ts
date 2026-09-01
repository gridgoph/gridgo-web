import { describe, expect, it } from "vitest";

import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";
import {
  artworkEvidence,
  fileLooksLikeImage,
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
