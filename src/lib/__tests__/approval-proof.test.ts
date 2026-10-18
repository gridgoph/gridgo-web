import { describe, expect, it } from "vitest";

import type { OrderApprovalProofSummary } from "@/lib/api/types";
import {
  approvalRowSummary,
  approvalRowTone,
  approvalRowVisible,
  itemSizeLine,
  optionsLine,
  recordStatusChip,
  requirementLine,
} from "@/lib/approval-proof";
import { formatDateTime } from "@/lib/format";

const AT = "2026-10-18T05:05:30.000Z";

function summary(overrides: Partial<OrderApprovalProofSummary> = {}): OrderApprovalProofSummary {
  return {
    requirement: { version: 1, required: true, method: "drawn" },
    records: [],
    readUrl: "/orders/o1/approval-proof",
    downloadUrl: "/orders/o1/approval-proof/download",
    ...overrides,
  };
}

describe("approval row", () => {
  it("names the method and time of the latest approval", () => {
    const signed = summary({
      records: [
        { id: "apr_1", phase: "checkout", status: "approved", method: "drawn", at: AT, snapshotSha256: "a" },
      ],
    });
    expect(approvalRowSummary(signed)).toBe(`Drawn signature, ${formatDateTime(AT)}`);
    expect(approvalRowTone(signed)).toBe("approved");
  });

  it("never reads a compatibility record as approved", () => {
    const legacy = summary({
      requirement: { version: 1, required: false, method: "one_tap" },
      records: [
        { id: "apr_1", phase: "checkout", status: "legacy_unrecorded", method: null, at: AT, snapshotSha256: "a" },
      ],
    });
    expect(approvalRowSummary(legacy)).toMatch(/^No approval collected/);
    expect(approvalRowSummary(legacy)).not.toMatch(/approved|signed|signature/i);
    expect(approvalRowTone(legacy)).toBe("quiet");
    expect(recordStatusChip({ status: "legacy_unrecorded" }).label).toBe("No approval collected");
  });

  it("says a required approval is still missing", () => {
    expect(approvalRowSummary(summary())).toBe("Not approved yet · drawn signature required");
    expect(approvalRowTone(summary())).toBe("waiting");
  });

  it("counts later records, and words a sample approval as such", () => {
    const both = summary({
      records: [
        { id: "apr_1", phase: "checkout", status: "approved", method: "drawn", at: AT, snapshotSha256: "a" },
        { id: "apr_2", phase: "sample", status: "approved", method: "drawn", at: AT, snapshotSha256: "b" },
      ],
    });
    expect(approvalRowSummary(both)).toBe(`Sample approved, ${formatDateTime(AT)} · 2 records`);
  });

  it("hides the row on an order from before approval records", () => {
    expect(approvalRowVisible(undefined)).toBe(false);
    expect(approvalRowVisible(summary({ requirement: null }))).toBe(false);
    expect(approvalRowVisible(summary())).toBe(true);
  });
});

describe("requirement", () => {
  it("states the snapshotted policy, required or not", () => {
    expect(requirementLine({ version: 1, required: true, method: "one_tap" })).toBe(
      "Required before the order proceeds: a one-tap approval.",
    );
    expect(requirementLine({ version: 1, required: false, method: "drawn" })).toMatch(
      /^Not required when this order was placed/,
    );
    expect(requirementLine(null)).toMatch(/before approval records began/);
  });
});

describe("snapshot lines", () => {
  it("reads the frozen options and size", () => {
    expect(
      optionsLine({
        options: [
          { groupNameSnapshot: "Size", optionLabelSnapshot: "A5" },
          { groupNameSnapshot: "Paper", optionLabelSnapshot: "Matte 150gsm" },
        ],
      }),
    ).toBe("Size: A5 · Paper: Matte 150gsm");
    expect(itemSizeLine({ measurement: { widthMilli: 148000, heightMilli: 210000 } })).toBe(
      "148 × 210 mm (5.8 × 8.3 in)",
    );
    expect(itemSizeLine({ measurement: null })).toBeNull();
  });
});
