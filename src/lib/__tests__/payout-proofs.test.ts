import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import {
  MAX_PROOFS_PER_STAGE,
  filingOutcome,
  proofCountLabel,
  proofFilingError,
  shopProofAccess,
  shopProofFileIds,
  stageProofIds,
} from "@/lib/payout-proofs";
import { escrowStages, legacyStages, proofOnFile, released } from "@/test/payout-plans";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("stageProofIds", () => {
  it("keeps the API's order and drops only a repeated id", () => {
    expect(stageProofIds({ pofFileIds: ["b", "a", "b", "", "c"] })).toEqual(["b", "a", "c"]);
  });

  it("reads a missing stage or list as none", () => {
    expect(stageProofIds(null)).toEqual([]);
    expect(stageProofIds({ pofFileIds: undefined as unknown as string[] })).toEqual([]);
  });
});

describe("proofCountLabel", () => {
  it("counts pictures in plain words", () => {
    expect(proofCountLabel(0)).toBe("No proof on file");
    expect(proofCountLabel(1)).toBe("1 proof on file");
    expect(proofCountLabel(27)).toBe("27 proofs on file");
  });
});

describe("shopProofFileIds", () => {
  it("collects the shop's own stages and never the rider's", () => {
    const order = {
      payoutMilestones: legacyStages({
        printing: { ...proofOnFile("a"), pofFileIds: ["a", "b"] },
        packaging_qc: proofOnFile("c"),
        delivered: proofOnFile("rider"),
      }),
    } as Pick<Order, "payoutMilestones">;
    expect([...shopProofFileIds(order)].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("shopProofAccess", () => {
  const [start, delivered, windowShare] = escrowStages();

  it("lets the shop add to its own stage during and after production", () => {
    for (const state of ["production", "supplier_self_qc", "out_for_delivery", "completed"]) {
      expect(shopProofAccess({ state }, start)).toEqual({
        allowed: true,
        remaining: MAX_PROOFS_PER_STAGE,
      });
    }
  });

  it("keeps a released stage open, counting what it already has", () => {
    const paid = { ...start, ...released("a"), pofFileIds: ids(12) };
    expect(shopProofAccess({ state: "completed" }, paid)).toEqual({
      allowed: true,
      remaining: 38,
    });
  });

  it("never offers the rider's stage or the window share", () => {
    expect(shopProofAccess({ state: "delivered" }, delivered)).toEqual({
      allowed: false,
      reason: null,
    });
    expect(shopProofAccess({ state: "completed" }, windowShare)).toEqual({
      allowed: false,
      reason: null,
    });
  });

  it("says nothing before production and nothing on a superseded share", () => {
    expect(shopProofAccess({ state: "payment_authorized" }, start).allowed).toBe(false);
    expect(
      shopProofAccess({ state: "completed" }, { ...start, status: "superseded" }),
    ).toEqual({ allowed: false, reason: null });
  });

  it("explains a full stage and a refund stop", () => {
    const full = { ...start, pofFileIds: ids(50) };
    const limit = shopProofAccess({ state: "production" }, full);
    expect(limit.allowed).toBe(false);
    expect(!limit.allowed && limit.reason).toMatch(/50 proof photos, the most it takes/);

    const stopped = shopProofAccess({ state: "production", refundHold: true }, start);
    expect(stopped.allowed).toBe(false);
    expect(!stopped.allowed && stopped.reason).toMatch(/stopped for a refund/);
  });
});

describe("filingOutcome", () => {
  it("is filed when the stage lists the new upload or grew", () => {
    expect(filingOutcome(["a"], ["a", "b"], "b")).toBe("filed");
    expect(filingOutcome(["a"], ["a", "x"], "b")).toBe("filed");
  });

  it("is a repeat when the stage kept its list", () => {
    expect(filingOutcome(["a", "b"], ["a", "b"], "c")).toBe("repeat");
  });
});

describe("proofFilingError", () => {
  it("names the API's limit", () => {
    expect(
      proofFilingError(new ApiError(409, { error: "proof_limit_reached", maxProofs: 50 })),
    ).toMatch(/This stage has 50 proof photos/);
  });

  it("explains a refund stop and a lost connection", () => {
    expect(
      proofFilingError(new ApiError(409, { error: "refund_fulfillment_stopped" })),
    ).toMatch(/stopped for a refund/);
    expect(proofFilingError(new TypeError("fetch failed"))).toMatch(/connection dropped/);
  });
});
