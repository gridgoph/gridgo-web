import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { AuditEntry, Order } from "@/lib/api/types";
import {
  EARLY_DELETE_REASON_MAX,
  earlyDeleteErrorMessage,
  earlyDeleteReasonError,
  fileDeletionRecord,
  fileIsGone,
  fileOrderReferences,
  filePurposeLabel,
  orderFileDeletions,
  orderFileIds,
  retentionGroups,
} from "@/lib/file-retention";

function entry(partial: Partial<AuditEntry>): AuditEntry {
  return {
    id: "aud_1",
    at: "2026-10-04T10:00:00.000Z",
    actorId: "user_super",
    actorRole: "super_admin",
    action: "file.early_delete",
    entityType: "file",
    entityId: "file_a",
    orderId: null,
    detail: { purpose: "artwork" },
    reason: "Client sent the wrong file",
    ...partial,
  };
}

describe("retentionGroups", () => {
  it("lists every file type with zero for purposes the API did not count", () => {
    const groups = retentionGroups({ artwork: 3, payment_proof: 1 });
    expect(groups.map((g) => g.id)).toEqual(["artwork", "money", "photos", "verification", "unused"]);
    const artwork = groups[0];
    expect(artwork.rows).toEqual([
      { purpose: "artwork", label: "Artwork", count: 3 },
      { purpose: "mockup", label: "Mockup", count: 0 },
    ]);
    expect(artwork.count).toBe(3);
    expect(groups[1].count).toBe(1);
    expect(groups[2].count).toBe(0);
  });

  it("files a purpose it does not know under unused uploads, in words", () => {
    const unused = retentionGroups({ brand_new_purpose: 2 }).find((g) => g.id === "unused")!;
    expect(unused.rows.at(-1)).toEqual({
      purpose: "brand_new_purpose",
      label: "Brand new purpose",
      count: 2,
    });
    expect(unused.count).toBe(2);
  });

  it("ignores nonsense counts", () => {
    const groups = retentionGroups({ artwork: -1, mockup: Number.NaN });
    expect(groups[0].count).toBe(0);
  });

  it("states each decided period", () => {
    const kept = Object.fromEntries(retentionGroups({}).map((g) => [g.id, g.keptFor]));
    expect(kept.artwork).toMatch(/30 days after the order is completed/);
    expect(kept.money).toMatch(/5 years/);
    expect(kept.photos).toMatch(/1 year/);
    expect(kept.verification).toMatch(/while the account is active/);
  });
});

describe("early-delete reason", () => {
  it("requires words and caps them at the API's limit", () => {
    expect(earlyDeleteReasonError("   ")).toMatch(/Write why/);
    expect(earlyDeleteReasonError("x".repeat(EARLY_DELETE_REASON_MAX + 1))).toMatch(/2,000/);
    expect(earlyDeleteReasonError("  Duplicate upload  ")).toBeNull();
  });

  it("explains a hold by an open case in plain words", () => {
    const err = new ApiError(409, { error: "file_retention_hold" });
    expect(earlyDeleteErrorMessage(err)).toMatch(/open issue, claim, refund, dispute or pickup escalation/);
    expect(earlyDeleteErrorMessage(new ApiError(403, { error: "forbidden" }))).toMatch(/Only Super Admin/);
  });
});

describe("deletion records", () => {
  it("reads the newest deletion entry for a file", () => {
    const record = fileDeletionRecord(
      [
        entry({ id: "a", action: "file.attach", at: "2026-10-05T00:00:00.000Z" }),
        entry({ id: "b" }),
      ],
      "file_a",
    );
    expect(record).toMatchObject({
      kind: "early",
      actorId: "user_super",
      reason: "Client sent the wrong file",
      purpose: "artwork",
    });
    expect(fileDeletionRecord([entry({ entityId: "file_b" })], "file_a")).toBeNull();
  });

  it("matches deletions to the files an order names, wherever it names them", () => {
    const order = {
      id: "ord_1",
      artworkFileIds: ["file_a"],
      payments: [{ proofFileId: "file_pay" }],
      payoutMilestones: [{ pofFileIds: ["file_pof"], receiptFileId: null }],
      productionPhotoFileIds: ["file_photo"],
    } as unknown as Order;
    expect(orderFileIds(order).sort()).toEqual(["file_a", "file_pay", "file_photo", "file_pof"]);
    const records = orderFileDeletions(
      [
        entry({ entityId: "file_photo", detail: { purpose: "production_photo" } }),
        entry({ entityId: "file_elsewhere" }),
        entry({
          entityId: "file_a",
          action: "file.retention_delete",
          reason: null,
          actorId: null,
          at: "2026-10-01T00:00:00.000Z",
        }),
      ],
      order,
    );
    expect(records.map((r) => [r.fileId, r.kind])).toEqual([
      ["file_photo", "early"],
      ["file_a", "retention"],
    ]);
  });
});

describe("file words", () => {
  it("never shows snake_case", () => {
    expect(filePurposeLabel("payment_proof")).toBe("Payment screenshot");
    expect(filePurposeLabel("handoff_signature")).toBe("Handoff signature");
    expect(filePurposeLabel(null)).toBe("File");
  });

  it("lists the orders a file is used by, once each", () => {
    expect(
      fileOrderReferences({
        references: [
          { type: "order", id: "ord_1", field: "artworkFileIds" },
          { type: "order", id: "ord_1", field: "mockupFileIds" },
          { type: "user", id: "user_1", field: "documents" },
        ],
      }),
    ).toEqual(["ord_1"]);
  });

  it("reads 404 as gone and anything else as a fault", () => {
    expect(fileIsGone(new ApiError(404, { error: "file_not_found" }))).toBe(true);
    expect(fileIsGone(new ApiError(500, { error: "server_error" }))).toBe(false);
    expect(fileIsGone(new Error("offline"))).toBe(false);
  });
});
