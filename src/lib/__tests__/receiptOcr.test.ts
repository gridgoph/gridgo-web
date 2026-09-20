import { describe, expect, it } from "vitest";

import {
  extractPaymentReference,
  nextReferenceFromOcr,
  OCR_LOW_CONFIDENCE,
  OCR_UNREADABLE,
  referenceFromOcr,
} from "@/lib/receiptOcr";

const GCASH_RECEIPT = `
GCash
Send Money
Successful
Sep 4, 2026  2:14 PM
₱51.75
Ref. No. 1234567890123
`.trim();

const MAYA_RECEIPT = `
Maya
Transfer successful
Amount PHP 1,250.00
Reference No.
MYA9K2P4Q8R1
Apr 12, 2026
`.trim();

const INSTAPAY_RECEIPT = `
InstaPay Ref. No. 001234567890
Amount ₱200.00
12/08/2026
`.trim();

describe("extractPaymentReference", () => {
  it("reads a GCash Ref. No. and ignores the date and amount", () => {
    expect(extractPaymentReference(GCASH_RECEIPT)).toBe("1234567890123");
  });

  it("reads a Maya reference on the line after the label", () => {
    expect(extractPaymentReference(MAYA_RECEIPT)).toBe("MYA9K2P4Q8R1");
  });

  it("reads an InstaPay reference", () => {
    expect(extractPaymentReference(INSTAPAY_RECEIPT)).toBe("001234567890");
  });

  it("does not invent a number from leftover dates and amounts", () => {
    expect(extractPaymentReference("₱51.75\nSep 4, 2026\nPHP 1,250.00")).toBeNull();
    expect(extractPaymentReference("")).toBeNull();
    expect(extractPaymentReference("Ref. No.")).toBeNull();
  });

  it("ignores an 8-digit date that looks like a short token", () => {
    expect(extractPaymentReference("20260904")).toBeNull();
  });

  it("reads a GCash Bankard biller reference, not BancNet or the card number", () => {
    const bankard = `
RCBC Credit (Bankard)
Paid via GCash
Credit Card Number 5179681308604108
GCash Reference No. 965373469
BancNet Reference No. 003999
Sep 8, 2026 8:14 AM
Total 780.00
`.trim();
    expect(extractPaymentReference(bankard)).toBe("965373469");
  });

  it("reads a GCash biller number when OCR stacks labels then numbers", () => {
    const stacked = `
GCash Reference No.
BancNet Reference No.
965373469
003999
Sep 8, 2026
`.trim();
    expect(extractPaymentReference(stacked)).toBe("965373469");
  });

  it("does not treat a 16-digit card PAN as the wallet reference", () => {
    expect(
      extractPaymentReference("Paid via GCash\n5179681308604108\nSep 8, 2026"),
    ).toBeNull();
  });

  it("reads a GCash send-money Ref No. and ignores the phone number", () => {
    const sent = `
HA..H AL..A U.
+63 975 942 4438
Sent via GCash
Amount 1,000.00
Total Amount Sent ₱1000.00
Ref No. 9044838604781
Sep 8, 2026 9:48 PM
`.trim();
    expect(extractPaymentReference(sent)).toBe("9044838604781");
  });

  it("reads real Android OCR with the biller's copy icon beside the number", () => {
    expect(extractPaymentReference(
      "GCash Reference No. 965373469 0)\nBancNet Reference No, 003999 0",
    )).toBe("965373469");
  });

  it("keeps a send reference separate from a date on the same OCR line", () => {
    expect(extractPaymentReference(
      "Ref No. 9044838604781 Sep 8, 2026 9:48 PM",
    )).toBe("9044838604781");
  });

  it("does not treat a +63 mobile as the wallet reference", () => {
    expect(
      extractPaymentReference("Sent via GCash\n+63 975 942 4438\nSep 8, 2026"),
    ).toBeNull();
  });
});

describe("referenceFromOcr", () => {
  it("keeps a labelled GCash number", () => {
    expect(referenceFromOcr({ text: GCASH_RECEIPT, confidence: 80 })).toBe("1234567890123");
  });

  it("drops a short unlabeled token when confidence is low", () => {
    expect(
      referenceFromOcr({
        text: "ABC12DEF",
        confidence: OCR_LOW_CONFIDENCE - 1,
      }),
    ).toBeNull();
  });

  it("never invents a number from a null read", () => {
    expect(referenceFromOcr(null)).toBeNull();
  });
});

describe("nextReferenceFromOcr", () => {
  it("fills the field from a successful read", () => {
    expect(
      nextReferenceFromOcr("", { status: "filled", reference: "1234567890123" }),
    ).toBe("1234567890123");
  });

  it("clears the field when the number could not be read", () => {
    expect(
      nextReferenceFromOcr("old", { status: "unreadable", reference: null }),
    ).toBe("");
    expect(OCR_UNREADABLE).toMatch(/could not be read/i);
  });

  it("leaves the field alone while reading", () => {
    expect(
      nextReferenceFromOcr("typed", { status: "reading", reference: null }),
    ).toBe("typed");
  });
});

it("normalizes every digit group in an explicitly labeled reference", () => {
  expect(extractPaymentReference("Ref No. 904483860 4781")).toBe("9044838604781");
  expect(extractPaymentReference("Ref No. 904 483 860 4781")).toBe("9044838604781");
});

it.each([
  ["Ref No. 1234567890123 0)", "1234567890123"],
  ["GCash Reference No. 965373469 0)", "965373469"],
  ["Ref No. 904483860 4781 0)", "9044838604781"],
  ["Ref No. 123456789012 0", "1234567890120"],
])("excludes only the recognized copy icon in %s", (text, reference) => {
  expect(extractPaymentReference(text)).toBe(reference);
});

it.each([
  ["Ref No. 1234567890123 8 Sep 2026", "1234567890123"],
  ["Ref No. 904483860 4781 08 September 2026", "9044838604781"],
  ["Ref No. 965373469 0) 8 Sep. 2026", "965373469"],
])("separates a neighboring date in %s", (text, reference) => {
  expect(extractPaymentReference(text)).toBe(reference);
});

it.each([
  "GCash Reference No.\n965373469\nBancNet Reference No. 003999123",
  "BancNet Reference No. 003999123\nGCash Reference No.\n965373469",
  "BancNet Reference No. 003999123\nGCash Reference No. 965373469",
  "GCash Reference No.\n965 373 469\nBancNet Reference No. 003999123",
])("prefers the GCash reference across inline and stacked layouts: %s", (text) => {
  expect(extractPaymentReference(text)).toBe("965373469");
});

it.each([
  ["Reference No. 123456789 ABC123", "123456789ABC123"],
  ["Reference No. 123 456 789 abc123", "123456789ABC123"],
  ["GCash Reference No. 123456789 ABC123", "123456789ABC123"],
])("preserves the complete alphanumeric reference in %s", (text, expected) => {
  expect(extractPaymentReference(text)).toBe(expected);
});

it.each([
  "GCash Reference No.\nBancNet Reference No. 003999123\n965373469",
  "GCash Reference No.\nBancNet Reference No. 003999123\n965 373 469",
])("skips populated neighboring reference fields in %s", (text) => {
  expect(extractPaymentReference(text)).toBe("965373469");
});

it.each([
  "Account No. 123456789",
  "Account Number 123456789",
  "Customer ID: ABC123456789",
  "Invoice Number 123456789",
])("rejects a neighboring field as a stacked reference: %s", (field) => {
  expect(extractPaymentReference(`GCash Reference No.\nSep 8, 2026\n${field}\n965373469`)).toBe("965373469");
});

it.each(["Account No.", "Customer ID:", "Invoice Number", "Total Amount"])(
  "returns unreadable when a neighboring field owns the next value: %s",
  (label) => {
    expect(extractPaymentReference(`GCash Reference No.\n${label}\n123456789\n965373469`)).toBeNull();
  },
);
