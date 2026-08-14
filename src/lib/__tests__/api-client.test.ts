import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, isApiError, me, setTokenProvider } from "@/lib/api/client";
import {
  allMilestonesReleased,
  canReportIssue,
  claimBlocksPayout,
  COMMISSION_PERCENT,
  DOWNPAYMENT_PERCENT,
  milestoneReleaseBlocker,
  orderHasPayoutHold,
  paymentAwaitsConfirmation,
  paymentIsSettled,
  PLATFORM_CONSTRAINT_COPY,
} from "@/lib/api/constraints";

afterEach(() => {
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

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

describe("API bearer tokens", () => {
  it("awaits a Clerk session token before sending the API request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "usr_ops",
            email: "person@example.com",
            name: "Operations user",
            role: "ops_admin",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    setTokenProvider(async () => "clerk-session-token");

    await me();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer clerk-session-token",
    );
  });
});

describe("platform constraints", () => {
  it("encodes the split payment and commission shares", () => {
    expect(DOWNPAYMENT_PERCENT).toBe(75);
    expect(COMMISSION_PERCENT).toBe(10);
  });

  it("reads an installment by where it stands, not by its wording", () => {
    expect(paymentAwaitsConfirmation({ status: "pending_confirmation" })).toBe(
      true,
    );
    expect(paymentAwaitsConfirmation({ status: "not_submitted" })).toBe(false);
    expect(paymentIsSettled({ status: "confirmed" })).toBe(true);
    // Orders migrated from the pre-v2 model are just as paid.
    expect(paymentIsSettled({ status: "legacy_confirmed" })).toBe(true);
    expect(paymentIsSettled({ status: "pending_confirmation" })).toBe(false);
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
    expect(PLATFORM_CONSTRAINT_COPY.pof_required.guidance).toMatch(/proof/i);
  });

  it("explains a blocked milestone before the click rather than after it", () => {
    const held = milestoneReleaseBlocker(
      { payoutHold: true, state: "completed" },
      { code: "printing", status: "pof_attached", pofFileIds: ["f1"] },
    );
    expect(held).toMatch(/claim/i);

    const noProof = milestoneReleaseBlocker(
      { payoutHold: false, state: "production" },
      { code: "printing", status: "pending_pof", pofFileIds: [] },
    );
    expect(noProof).toMatch(/proof/i);

    const clear = milestoneReleaseBlocker(
      { payoutHold: false, state: "production" },
      { code: "printing", status: "pof_attached", pofFileIds: ["f1"] },
    );
    expect(clear).toBeNull();
  });

  it("only clears payout close-out when every milestone has released", () => {
    expect(
      allMilestonesReleased([{ status: "released" }, { status: "released" }]),
    ).toBe(true);
    expect(
      allMilestonesReleased([{ status: "released" }, { status: "pof_attached" }]),
    ).toBe(false);
    expect(allMilestonesReleased([])).toBe(false);
    expect(allMilestonesReleased(undefined)).toBe(false);
  });
});
