import { describe, expect, it } from "vitest";

import { ApiError, isApiError } from "@/lib/api/client";
import {
  canReportIssue,
  claimBlocksPayout,
  COD_MAX_MINOR,
  isWithinCodLimit,
  orderHasPayoutHold,
  PLATFORM_CONSTRAINT_COPY,
} from "@/lib/api/constraints";

describe("ApiError", () => {
  it("exposes snake_case code and kind without string-matching messages", () => {
    const err = new ApiError(403, { error: "forbidden" });
    expect(err.code).toBe("forbidden");
    expect(err.kind).toBe("forbidden");
    expect(err.status).toBe(403);
    expect(isApiError(err)).toBe(true);
  });

  it("classifies common status codes", () => {
    expect(new ApiError(401, { error: "unauthorized" }).kind).toBe(
      "unauthorized",
    );
    expect(new ApiError(404, { error: "claim_not_found" }).kind).toBe(
      "not_found",
    );
    expect(new ApiError(409, { error: "payout_held" }).kind).toBe("conflict");
    expect(new ApiError(400, { error: "cod_limit", maxMinor: 150000 }).kind).toBe(
      "validation",
    );
  });

  it("surfaces extra body fields via details", () => {
    const err = new ApiError(400, {
      error: "cod_limit",
      maxMinor: 150000,
    });
    expect(err.detail<number>("maxMinor")).toBe(150000);
    expect(err.details).toEqual({ maxMinor: 150000 });
  });
});

describe("platform constraints", () => {
  it("encodes the COD cap in minor units", () => {
    expect(COD_MAX_MINOR).toBe(150_000);
    expect(isWithinCodLimit(100_000, 50_000)).toBe(true);
    expect(isWithinCodLimit(100_001, 50_000)).toBe(false);
  });

  it("detects payout hold and issue window", () => {
    expect(orderHasPayoutHold({ payoutHold: true })).toBe(true);
    expect(canReportIssue("issue_window_open")).toBe(true);
    expect(canReportIssue("submitted")).toBe(false);
    expect(claimBlocksPayout("payout_held")).toBe(true);
    expect(claimBlocksPayout("released")).toBe(false);
  });

  it("provides pre-hit guidance for known constraints", () => {
    expect(PLATFORM_CONSTRAINT_COPY.payout_held.guidance).toMatch(/hold/i);
    expect(PLATFORM_CONSTRAINT_COPY.cod_limit.guidance).toMatch(/1,500/);
  });
});
