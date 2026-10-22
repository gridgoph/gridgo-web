import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import {
  lapseStandingLine,
  normalizeLapses,
  normalizeReviews,
  readFeed,
  type ProductionLapse,
} from "@/lib/shop-record";

function lapse(patch: Partial<ProductionLapse> = {}): ProductionLapse {
  return {
    id: "lapse_1",
    orderId: "ord_1",
    deadlineAt: "2026-10-01T00:00:00.000Z",
    tier: "minor",
    status: "warning_only",
    remainingBalanceMinor: 10000,
    deductionMinor: 15000,
    ...patch,
  };
}

describe("shop record feeds", () => {
  it("reads a missing route as not open yet, and a failed read as failed", () => {
    expect(readFeed(null, new ApiError(404, { error: "not_found" })).status).toBe("not_open_yet");
    expect(readFeed(null, new ApiError(405, { error: "method_not_allowed" })).status).toBe("not_open_yet");
    expect(readFeed(null, new ApiError(500, { error: "server" })).status).toBe("failed");
    expect(readFeed(null).status).toBe("not_open_yet");
    expect(readFeed(normalizeReviews({ summary: { count: 0, overall: null }, reviews: [] }))?.status).toBe("loaded");
  });

  it("does not quote a deduction for a warning, and caps an applied one once", () => {
    expect(lapseStandingLine(lapse())).toBe("Warning only, no deduction");
    expect(lapseStandingLine(lapse({ status: "warned" }))).toMatch(/no money is taken/i);
    expect(lapseStandingLine(lapse({ status: "warned", deductionMinor: 5000 }))).not.toMatch(/₱|PHP|\d/);
    const applied = lapseStandingLine(
      lapse({ status: "applied", remainingBalanceMinor: 10000, deductionMinor: 15000 }),
    );
    expect(applied).toContain("100");
    expect(applied).not.toContain("150");
  });

  it("treats an unreadable lapse body as not open yet", () => {
    expect(normalizeLapses({ ok: true })).toBeNull();
    expect(readFeed(normalizeLapses({ ok: true })).status).toBe("not_open_yet");
  });
});
