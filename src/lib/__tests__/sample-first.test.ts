import { describe, expect, it } from "vitest";

import type { SampleBatch } from "@/lib/api/types";
import {
  heldPriceBlockerLine,
  holdClock,
  linkedOrderOf,
  matchesSampleBatchFilter,
  optionEffect,
  parseHoldDays,
  presentDecision,
  presentSampleBatchStatus,
  sampleBatchFilterCounts,
  sampleTagOf,
  sortSampleBatches,
  timeLeft,
} from "@/lib/sample-first";

const NOW = Date.parse("2026-11-03T00:00:00.000Z");
const DAY = 86_400_000;

function batch(patch: Partial<SampleBatch> = {}): SampleBatch {
  return {
    id: "sbd_1",
    status: "awaiting_sample",
    catalogItemId: "ci_1",
    itemName: "Flyers A5",
    sampleOrderId: "ord_sample",
    sampleOrderState: "in_production",
    batchOrderId: null,
    previousDraftId: null,
    replacedByDraftId: null,
    batch: { quantity: 500 },
    holdDays: 14,
    sampleDeliveredAt: null,
    heldUntil: null,
    holdActive: false,
    holdExpired: false,
    heldPrice: null,
    currentPrice: null,
    canOrderAtHeldPrice: false,
    heldPriceBlocker: "sample_batch_not_approved",
    canOrderAtCurrentPrice: false,
    approval: null,
    rejection: null,
    version: 1,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    ...patch,
  };
}

describe("order tags and links", () => {
  it("reads the tag from orderTags and nothing else", () => {
    expect(sampleTagOf({ orderTags: ["sample"] })).toBe("sample");
    expect(sampleTagOf({ orderTags: ["batch_from_sample"] })).toBe("batch");
    expect(sampleTagOf({ orderTags: [] })).toBeNull();
    expect(sampleTagOf({ orderTags: null })).toBeNull();
    expect(sampleTagOf({})).toBeNull();
  });

  it("links a sample to its batch and a batch to its sample", () => {
    expect(
      linkedOrderOf({ orderTags: ["sample"], batchOrderId: "ord_b", sampleOrderId: null }),
    ).toEqual({ orderId: "ord_b", label: "Open the batch order" });
    expect(
      linkedOrderOf({ orderTags: ["batch_from_sample"], sampleOrderId: "ord_s", batchOrderId: null }),
    ).toEqual({ orderId: "ord_s", label: "Open the sample order" });
    // A sample whose batch is not ordered yet links nowhere.
    expect(linkedOrderOf({ orderTags: ["sample"], batchOrderId: null, sampleOrderId: null })).toBeNull();
  });
});

describe("the client's decision", () => {
  it("shows a tick approval with its photo and note", () => {
    const view = presentDecision({
      draftId: "sbd_1",
      decision: "approved",
      method: "tick",
      at: "2026-11-01T00:00:00.000Z",
      samplePhotoFileId: "file_photo",
      note: " Colour is right ",
    });
    expect(view).toMatchObject({
      decision: "approved",
      headline: "Approved with a tick",
      tone: "success",
      photoFileId: "file_photo",
      note: "Colour is right",
    });
  });

  it("reads an unknown method as approved with evidence", () => {
    const view = presentDecision({
      draftId: "sbd_1",
      decision: "approved",
      method: "signature",
      at: "2026-11-01T00:00:00.000Z",
      samplePhotoFileId: "file_photo",
    });
    expect(view?.headline).toBe("Approved");
    expect(view?.photoFileId).toBe("file_photo");
  });

  it("says what follows a rejection", () => {
    expect(
      presentDecision({
        draftId: "sbd_1",
        decision: "rejected",
        at: "2026-11-01T00:00:00.000Z",
        reason: "Too dark",
        next: "resample",
      }),
    ).toMatchObject({ headline: "Client will order another sample", note: "Too dark" });
    expect(
      presentDecision({
        draftId: "sbd_1",
        decision: "rejected",
        at: "2026-11-01T00:00:00.000Z",
        reason: "Not needed",
        next: "cancel",
      })?.headline,
    ).toBe("Client cancelled the batch");
    expect(presentDecision(null)).toBeNull();
  });
});

describe("the hold clock", () => {
  it("has not started before the sample is delivered", () => {
    const clock = holdClock(batch(), NOW);
    expect(clock.label).toBe("Not started");
    expect(clock.line).toBe("The price is held for 14 days once the sample is delivered.");
  });

  it("counts down while the hold runs", () => {
    const clock = holdClock(
      batch({
        status: "approved",
        sampleDeliveredAt: new Date(NOW - 4 * DAY).toISOString(),
        heldUntil: new Date(NOW + 10 * DAY + 3_600_000).toISOString(),
        holdActive: true,
      }),
      NOW,
    );
    expect(clock.label).toBe("10 days left");
    expect(clock.tone).toBe("info");
  });

  it("says when it has expired, even if the API flag lags", () => {
    const expired = holdClock(
      batch({ status: "approved", heldUntil: new Date(NOW - DAY).toISOString(), holdExpired: true }),
      NOW,
    );
    expect(expired.label).toBe("Expired");
    expect(expired.line).toMatch(/can still order the batch at today's price/);
    const lagging = holdClock(
      batch({ status: "approved", heldUntil: new Date(NOW - 1).toISOString(), holdActive: true }),
      NOW,
    );
    expect(lagging.label).toBe("Expired");
  });

  it("is used once the batch is ordered and closed after a rejection", () => {
    expect(holdClock(batch({ status: "ordered" }), NOW).label).toBe("Used");
    expect(holdClock(batch({ status: "cancelled" }), NOW).label).toBe("Closed");
  });

  it("words the time left in days, then hours", () => {
    expect(timeLeft(new Date(NOW + DAY).toISOString(), NOW)).toBe("1 day left");
    expect(timeLeft(new Date(NOW + 5 * 3_600_000).toISOString(), NOW)).toBe("5 hours left");
    expect(timeLeft(new Date(NOW + 60_000).toISOString(), NOW)).toBe("1 hour left");
    expect(timeLeft(new Date(NOW).toISOString(), NOW)).toBeNull();
    expect(timeLeft(null, NOW)).toBeNull();
  });

  it("explains why the held price cannot be used", () => {
    expect(heldPriceBlockerLine(null)).toBeNull();
    expect(heldPriceBlockerLine("sample_hold_expired")).toBe(
      "The hold has ended. Only today's price is open.",
    );
    expect(heldPriceBlockerLine("sample_shop_changed")).toMatch(/Another shop made the sample/);
    expect(heldPriceBlockerLine("something_new")).toBe("The held price cannot be used right now.");
  });
});

describe("the list", () => {
  const rows = [
    batch({ id: "a", status: "awaiting_sample", updatedAt: "2026-10-02T00:00:00.000Z" }),
    batch({ id: "b", status: "approved", heldUntil: "2026-11-10T00:00:00.000Z" }),
    batch({ id: "c", status: "approved", heldUntil: "2026-11-05T00:00:00.000Z" }),
    batch({ id: "d", status: "ordered" }),
    batch({ id: "e", status: "rejected" }),
    batch({ id: "f", status: "cancelled" }),
  ];

  it("counts each filter", () => {
    expect(sampleBatchFilterCounts(rows)).toEqual({
      open: 3,
      awaiting_sample: 1,
      approved: 2,
      ordered: 1,
      closed: 2,
      all: 6,
    });
    expect(matchesSampleBatchFilter(rows[4], "closed")).toBe(true);
    expect(matchesSampleBatchFilter(rows[3], "open")).toBe(false);
  });

  it("leads with approved holds ending soonest, then samples still on the way", () => {
    expect(sortSampleBatches(rows).map((row) => row.id).slice(0, 3)).toEqual(["c", "b", "a"]);
  });

  it("names every status in plain words", () => {
    expect(presentSampleBatchStatus("awaiting_sample").label).toBe("Waiting for the sample");
    expect(presentSampleBatchStatus("ordered").label).toBe("Batch ordered");
    expect(presentSampleBatchStatus("brand_new").label).toBe("Unknown");
  });
});

describe("held price list and setting", () => {
  it("words an option's price effect", () => {
    const option = {
      optionId: "o",
      groupName: "Paper",
      label: "Glossy",
      priceModifierMinor: 200,
      priceMultiplierBps: null,
    };
    expect(optionEffect(option)).toBe("+₱2.00");
    expect(optionEffect({ ...option, priceModifierMinor: 0, priceMultiplierBps: 11_000 })).toBe(
      "×1.10",
    );
    expect(optionEffect({ ...option, priceModifierMinor: 0 })).toBe("No change");
  });

  it("accepts whole days from 1 to 90 only", () => {
    expect(parseHoldDays("14")).toBe(14);
    expect(parseHoldDays(" 90 ")).toBe(90);
    for (const bad of ["", "0", "91", "7.5", "-1", "abc"]) expect(parseHoldDays(bad)).toBeNull();
  });
});
