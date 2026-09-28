import { describe, expect, it } from "vitest";

import { stageSummary } from "@/app/ops/_lib/pipeline";
import type { AuditEntry, Order, ProductionProgress } from "@/lib/api/types";
import {
  canAddProgressPhoto,
  canCorrectProduction,
  productionCorrections,
  productionPhotoMissing,
  productionProgressOf,
  progressPhotos,
  signedUrlUsable,
} from "@/lib/production-progress";
import { actionsForJob, primaryAction, shopProofOutstanding } from "@/lib/supplier-actions";
import { escrowStages, proofOnFile } from "@/test/payout-plans";

const WAITING: ProductionProgress = { status: "waiting_for_photo", photos: [] };
const TWO_PHOTOS: ProductionProgress = {
  status: "photos_available",
  photos: [
    { fileId: "file_late", contentType: "image/jpeg", at: "2026-09-28T09:00:00.000Z" },
    { fileId: "file_early", contentType: "image/png", at: "2026-09-28T08:00:00.000Z" },
  ],
};

describe("reading productionProgress", () => {
  it("treats an API that sends no gallery as unknown, never as missing", () => {
    const old = { state: "production" };
    expect(productionProgressOf(old)).toBeNull();
    expect(productionPhotoMissing(old)).toBe(false);
    expect(progressPhotos(old)).toEqual([]);
  });

  it("reads the waiting state and orders photos oldest first", () => {
    expect(productionPhotoMissing({ state: "production", productionProgress: WAITING })).toBe(
      true,
    );
    const order = { state: "production", productionProgress: TWO_PHOTOS };
    expect(productionPhotoMissing(order)).toBe(false);
    expect(progressPhotos(order).map((photo) => photo.fileId)).toEqual([
      "file_early",
      "file_late",
    ]);
  });

  it("opens photo uploads and staff corrections only on the gated edges", () => {
    for (const state of ["production", "supplier_self_qc"]) {
      expect(canAddProgressPhoto({ state })).toBe(true);
      expect(canCorrectProduction({ state })).toBe(true);
    }
    for (const state of ["payment_authorized", "ready_for_dispatch", "rider_assigned"]) {
      expect(canAddProgressPhoto({ state })).toBe(false);
      expect(canCorrectProduction({ state })).toBe(false);
    }
  });

  it("refreshes a signed link that is missing or about to expire", () => {
    const now = Date.parse("2026-09-28T08:00:00.000Z");
    expect(signedUrlUsable({ downloadUrl: null }, now)).toBe(false);
    expect(
      signedUrlUsable(
        { downloadUrl: "https://x", downloadUrlExpiresAt: "2026-09-28T08:00:10.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      signedUrlUsable(
        { downloadUrl: "https://x", downloadUrlExpiresAt: "2026-09-28T08:05:00.000Z" },
        now,
      ),
    ).toBe(true);
  });
});

describe("audited production corrections", () => {
  const entry = (extra: Partial<AuditEntry>): AuditEntry => ({
    id: "aud_1",
    at: "2026-09-28T08:00:00.000Z",
    actorId: "user_ops",
    actorRole: "ops_admin",
    action: "order.production_override",
    entityType: "order",
    entityId: "ord_1",
    orderId: "ord_1",
    detail: { from: "production", to: "ready_for_dispatch", photoMissing: true },
    reason: "Verified finished work at the counter",
    ...extra,
  });

  it("keeps only this order's corrections, with the reason and whether a photo existed", () => {
    const corrections = productionCorrections(
      [
        entry({}),
        entry({ id: "aud_other", orderId: "ord_2", entityId: "ord_2" }),
        entry({ id: "aud_release", action: "payout_milestone.release" }),
      ],
      "ord_1",
    );
    expect(corrections).toEqual([
      {
        id: "aud_1",
        at: "2026-09-28T08:00:00.000Z",
        actorId: "user_ops",
        actorRole: "ops_admin",
        reason: "Verified finished work at the counter",
        from: "production",
        to: "ready_for_dispatch",
        photoMissing: true,
      },
    ]);
  });

  it("reads a failed or malformed audit read as no corrections", () => {
    expect(productionCorrections(null, "ord_1")).toEqual([]);
    expect(productionCorrections(undefined, "ord_1")).toEqual([]);
  });
});

describe("the shop's packing gate", () => {
  it("asks for a progress photo when the start proof was a PDF", () => {
    const job = {
      state: "production",
      payoutHold: false,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages({ production_started: proofOnFile("file_pdf") }),
      productionProgress: WAITING,
    };
    expect(actionsForJob(job).map((action) => action.kind)).toEqual(["add_progress_photo"]);
    expect(primaryAction(job)?.label).toBe("Add a progress photo");
    expect(shopProofOutstanding(job)).toBe(true);
  });

  it("offers packing once a photo is on file, and a start proof still comes first", () => {
    const withPhoto = {
      state: "supplier_self_qc",
      payoutHold: false,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages({ production_started: proofOnFile("file_early") }),
      productionProgress: TWO_PHOTOS,
    };
    expect(primaryAction(withPhoto)?.kind).toBe("ready_for_pickup");

    const noProof = {
      ...withPhoto,
      state: "production",
      payoutMilestones: escrowStages(),
      productionProgress: WAITING,
    };
    expect(primaryAction(noProof)?.kind).toBe("add_proof");
  });

  it("keeps the old flow against an API that sends no gallery", () => {
    const job = {
      state: "production",
      payoutHold: false,
      payoutPlanVersion: 2,
      payoutMilestones: escrowStages({ production_started: proofOnFile("file_pdf") }),
    };
    expect(primaryAction(job)?.kind).toBe("ready_for_pickup");
  });
});

describe("the production row, closed", () => {
  const order = (extra: Partial<Order>) =>
    ({
      state: "production",
      timeline: [],
      payoutMilestones: escrowStages(),
      ...extra,
    }) as unknown as Order;

  it("says a photo is still owed, or counts the photos", () => {
    expect(
      stageSummary(order({ productionProgress: WAITING }), "production", String, String),
    ).toBe("No progress photo from the shop yet.");
    expect(
      stageSummary(order({ productionProgress: TWO_PHOTOS }), "production", String, String),
    ).toBe("2 progress photos from the shop.");
  });

  it("says a job left production without a photo", () => {
    expect(
      stageSummary(
        order({
          state: "rider_assigned",
          readyAt: "2026-09-28T09:00:00.000Z",
          productionProgress: WAITING,
        }),
        "production",
        String,
        String,
      ),
    ).toBe("Handed over 2026-09-28T09:00:00.000Z. No progress photo was sent.");
  });
});
