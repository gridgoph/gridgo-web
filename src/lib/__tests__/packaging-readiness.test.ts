import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import {
  packagingCheck,
  packagingHold,
  readRequirements,
  stepRefusal,
} from "@/lib/packaging-readiness";
import { presentTimelineActor, presentTimelineNote } from "@/lib/order-state";
import { actionsForJob, packingPhotoOwed } from "@/lib/supplier-actions";

const CLAIM = {
  code: "claim_hold_active",
  message:
    "This order cannot be packaged for pickup while a claim holds payouts. Operations must clear the claim first.",
};

function order(extra: Partial<Order>): Order {
  return {
    state: "production",
    payoutMilestones: [],
    payoutHold: false,
    ...extra,
  } as Order;
}

describe("reading what the API still needs (report 6C695C15)", () => {
  it("keeps the API's own sentence and names the kind", () => {
    expect(readRequirements([CLAIM])).toEqual([
      { kind: "claim", code: "claim_hold_active", message: CLAIM.message },
    ]);
  });

  it("replaces a message that is only a code with this portal's sentence", () => {
    const [item] = readRequirements([
      { code: "packing_photo_required", message: "packing_photo_required" },
    ]);
    expect(item.message).toMatch(/^Add a photo of the finished prints packed/);
  });

  it("says something plain for a code this portal does not know", () => {
    const [item] = readRequirements([{ code: "new_rule" }]);
    expect(item).toMatchObject({
      kind: "other",
      message: expect.stringMatching(/Ask Operations/),
    });
  });

  it("has no check outside the two packing states, or from an older API", () => {
    expect(packagingCheck(order({ state: "ready_for_dispatch" }))).toBeNull();
    expect(packagingCheck(order({}))).toBeNull();
  });

  it("ticks photos that are not missing and reads the receipt as optional", () => {
    const check = packagingCheck(
      order({
        transitionReadiness: {
          ready_for_dispatch: {
            allowed: false,
            missing: [CLAIM],
            receiptScan: { required: false, attached: true },
          },
        },
      }),
    );
    expect(check?.photos.every((photo) => photo.done)).toBe(true);
    expect(check?.receiptAttached).toBe(true);
    expect(packagingHold(check)?.message).toBe(CLAIM.message);
  });
});

describe("a refused step", () => {
  it("carries the API's message and every missing item", () => {
    const refusal = stepRefusal(
      new ApiError(409, {
        error: "claim_hold_active",
        message: CLAIM.message,
        missing: [CLAIM],
      }),
    );
    expect(refusal).toMatchObject({ code: "claim_hold_active", message: CLAIM.message });
    expect(refusal?.missing).toHaveLength(1);
  });

  it("is not a refusal when the server failed", () => {
    expect(stepRefusal(new ApiError(500, { error: "server_error" }))).toBeNull();
    expect(stepRefusal(new Error("offline"))).toBeNull();
  });
});

describe("the packing photo without a readiness list", () => {
  it("is owed when the packing gallery is empty, and asked for before packaging", () => {
    const job = order({
      productionProgress: {
        status: "photos_available",
        photos: [{ fileId: "f1", contentType: "image/jpeg", at: "2026-10-15T00:00:00Z" }],
      },
      packingProgress: { status: "waiting_for_photo", photos: [] },
    });
    expect(packingPhotoOwed(job)).toBe(true);
    expect(actionsForJob(job).map((action) => action.kind)).toEqual([
      "add_packing_photo",
    ]);
  });

  it("owes nothing on an API that sends no packing gallery", () => {
    expect(packingPhotoOwed(order({}))).toBe(false);
    expect(actionsForJob(order({}))[0].kind).toBe("ready_for_pickup");
  });
});

describe("supplier updates", () => {
  it("credits no one when the entry names no one", () => {
    expect(presentTimelineActor(undefined)).toBe("");
    expect(presentTimelineActor("system")).toBe("GRIDGO");
  });

  it("names an older note's payout stage code", () => {
    expect(presentTimelineNote("Proof filed for packaging_qc")).toBe(
      "Proof filed for Packaging",
    );
  });
});
