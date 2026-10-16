import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Voucher, VoucherCampaign } from "@/lib/api/types";
import {
  EMPTY_CAMPAIGN_DRAFT,
  campaignEditable,
  campaignMoves,
  canReissue,
  canVoid,
  countdown,
  formatMinorString,
  inWalletTab,
  inputFromDraft,
  issueBlocker,
  ledgerOrderIds,
  manilaDayEnd,
  manilaDayStart,
  manilaLocalToIso,
  isoToManilaLocal,
  minorStringIsNegative,
  orderVoucher,
  parseRecipients,
  presentVoucherStatus,
  recipientsToSend,
  summarizeIssue,
  testerDraft,
  validateCampaignDraft,
  validityText,
  voucherErrorMessage,
} from "@/lib/vouchers";

const NOW = Date.parse("2026-10-09T08:00:00.000Z");

const campaign: VoucherCampaign = {
  id: "vcamp_1",
  name: "Soft-launch tester thanks",
  code: "A1B2C3D4E5F60718",
  mode: "assigned",
  valueMinor: 1500,
  totalLimit: 100,
  perAccountLimit: 1,
  endsAt: null,
  validityDays: 7,
  status: "active",
  createdAt: "2026-10-09T07:00:00.000Z",
  updatedAt: "2026-10-09T07:00:00.000Z",
};

const voucher: Voucher = {
  id: "vch_1",
  campaignId: "vcamp_1",
  name: "Soft-launch tester thanks",
  valueMinor: 1500,
  status: "available",
  issuedAt: "2026-10-09T08:00:00.000Z",
  expiresAt: "2026-10-16T08:00:00.000Z",
  secondsRemaining: 604800,
  redeemable: true,
  reservation: null,
  fundedBy: "GRIDGO",
  transferable: false,
  cashValue: false,
};

describe("campaign form", () => {
  it("starts the tester preset at ₱15, issued by GRIDGO, seven days", () => {
    const input = inputFromDraft(testerDraft());
    expect(input).toMatchObject({
      valueMinor: 1500,
      mode: "assigned",
      validityDays: 7,
      endsAt: null,
      perAccountLimit: 1,
    });
    expect(input).not.toHaveProperty("code");
    expect(validateCampaignDraft(testerDraft(), NOW)).toEqual({});
  });

  it("says what is missing, field by field", () => {
    const errors = validateCampaignDraft(EMPTY_CAMPAIGN_DRAFT, NOW);
    expect(Object.keys(errors).sort()).toEqual(["name", "totalLimit", "value"]);
  });

  it("sends a typed shared code upper-cased and checks its shape", () => {
    const draft = { ...testerDraft(), mode: "shared" as const, code: " testers-2026 " };
    expect(inputFromDraft(draft).code).toBe("TESTERS-2026");
    expect(validateCampaignDraft({ ...draft, code: "ab" }, NOW).code).toBeDefined();
    expect(validateCampaignDraft({ ...draft, code: "no spaces" }, NOW).code).toBeDefined();
  });

  it("never sends both an end date and a number of days", () => {
    const draft = { ...testerDraft(), validity: "date" as const, endsAt: "2026-10-20T17:00" };
    expect(inputFromDraft(draft)).toMatchObject({
      endsAt: "2026-10-20T09:00:00.000Z",
      validityDays: null,
    });
    expect(validateCampaignDraft({ ...draft, endsAt: "2026-10-01T09:00" }, NOW).endsAt).toBe(
      "Pick a time that is still ahead.",
    );
    expect(validateCampaignDraft({ ...testerDraft(), days: "366" }, NOW).days).toBeDefined();
  });

  it("locks terms once launched or issued", () => {
    expect(campaignEditable({ ...campaign, status: "draft" }, 0)).toBe(true);
    expect(campaignEditable({ ...campaign, status: "draft" }, 1)).toBe(false);
    expect(campaignEditable({ ...campaign, status: "draft" }, null)).toBe(false);
    expect(campaignEditable(campaign, 0)).toBe(false);
  });
});

describe("campaign status", () => {
  it("offers only the API's moves, ending last", () => {
    expect(campaignMoves("draft").map((m) => m.to)).toEqual(["active", "ended"]);
    expect(campaignMoves("active").map((m) => m.to)).toEqual(["paused", "ended"]);
    expect(campaignMoves("paused").map((m) => m.to)).toEqual(["active", "ended"]);
    expect(campaignMoves("ended")).toEqual([]);
    expect(campaignMoves("active").find((m) => m.to === "ended")?.final).toBe(true);
  });

  it("explains why a campaign cannot be issued", () => {
    expect(issueBlocker(campaign, NOW)).toBeNull();
    expect(issueBlocker({ ...campaign, mode: "shared" }, NOW)).toMatch(/typing the code/);
    expect(issueBlocker({ ...campaign, status: "draft" }, NOW)).toMatch(/Launch/);
    expect(issueBlocker({ ...campaign, status: "paused" }, NOW)).toMatch(/Resume/);
    expect(issueBlocker({ ...campaign, endsAt: "2026-10-01T00:00:00.000Z" }, NOW)).toMatch(/passed/);
  });

  it("states validity in words", () => {
    expect(validityText(campaign)).toBe("7 days from issue");
    expect(validityText({ endsAt: "2026-10-20T09:00:00.000Z", validityDays: null })).toMatch(/^Until /);
  });
});

describe("Philippine time", () => {
  it("round-trips a local Manila time", () => {
    expect(manilaLocalToIso("2026-10-20T17:00")).toBe("2026-10-20T09:00:00.000Z");
    expect(isoToManilaLocal("2026-10-20T09:00:00.000Z")).toBe("2026-10-20T17:00");
    expect(manilaLocalToIso("2026-10-20")).toBeNull();
  });

  it("makes date filters inclusive Manila days", () => {
    expect(manilaDayStart("2026-10-09")).toBe("2026-10-08T16:00:00.000Z");
    expect(manilaDayEnd("2026-10-09")).toBe("2026-10-09T15:59:59.999Z");
    expect(manilaDayStart("")).toBeUndefined();
  });
});

describe("wallet items", () => {
  it("counts down amber under 48 hours and red under 24", () => {
    expect(countdown("2026-10-16T08:00:00.000Z", NOW)).toEqual({ text: "7 days left", urgency: "calm" });
    expect(countdown("2026-10-11T02:00:00.000Z", NOW).urgency).toBe("soon");
    expect(countdown("2026-10-10T02:30:00.000Z", NOW)).toEqual({ text: "18 h 30 min left", urgency: "urgent" });
    expect(countdown("2026-10-09T08:00:00.000Z", NOW).urgency).toBe("over");
  });

  it("names a held or blocked voucher, never colour alone", () => {
    expect(presentVoucherStatus(voucher).label).toBe("Available");
    expect(
      presentVoucherStatus({
        ...voucher,
        redeemable: false,
        reservation: { id: "r", cartId: "c", expiresAt: "2026-10-09T08:30:00.000Z" },
      }).label,
    ).toBe("Held at checkout");
    expect(presentVoucherStatus({ ...voucher, redeemable: false }).label).toBe("Not usable now");
    expect(presentVoucherStatus({ ...voucher, status: "void" }).label).toBe("Voided");
  });

  it("voids only available vouchers and reissues only unexpired voids", () => {
    expect(canVoid(voucher)).toBe(true);
    expect(canVoid({ ...voucher, status: "used" })).toBe(false);
    expect(canReissue({ ...voucher, status: "void" }, NOW)).toBe(true);
    expect(canReissue({ ...voucher, status: "void", expiresAt: "2026-10-01T00:00:00.000Z" }, NOW)).toBe(false);
  });

  it("files voided vouchers under Expired, as the client's wallet does", () => {
    expect(inWalletTab({ ...voucher, status: "void" }, "expired")).toBe(true);
    expect(inWalletTab({ ...voucher, status: "void" }, "available")).toBe(false);
  });
});

describe("issuing to a list", () => {
  it("reads a pasted list, keeps addresses, skips words and counts repeats once", () => {
    const parsed = parseRecipients(
      "Email\nOne@Example.test\ntwo@example.test, one@example.test; Sample Person <three@example.test>",
    );
    expect(parsed.recipients.map((r) => r.email)).toEqual([
      "one@example.test",
      "two@example.test",
      "three@example.test",
    ]);
    expect(parsed.repeats).toBe(1);
    expect(parsed.ignored).toEqual(["Email", "Sample", "Person"]);
    expect(parsed.adultColumn).toBe(false);
  });

  it("reads a CSV with the API's rules, including quotes and the adult column", () => {
    const parsed = parseRecipients(
      'email,adultConfirmed\n"a@example.test",true\nb@example.test,FALSE\n"c""x@example.test",',
    );
    expect(parsed.problem).toBeNull();
    expect(parsed.adultColumn).toBe(true);
    expect(parsed.recipients).toEqual([
      { email: "a@example.test", adultConfirmed: true },
      { email: "b@example.test", adultConfirmed: false },
      { email: 'c"x@example.test', adultConfirmed: false },
    ]);
  });

  it("refuses a malformed adult column before anything is sent", () => {
    expect(parseRecipients("email,adultConfirmed\na@example.test,yes").problem).toMatch(/true or false/);
    expect(parseRecipients('email,adultConfirmed\n"a@example.test,true').problem).toMatch(/quote/);
    expect(parseRecipients("email,adultConfirmed\na@example.test,true,x").problem).toMatch(/columns/);
  });

  it("picks the addresses out of any other spreadsheet export", () => {
    const parsed = parseRecipients("email,name\na@example.test,Sample");
    expect(parsed.problem).toBeNull();
    expect(parsed.recipients).toEqual([{ email: "a@example.test", adultConfirmed: false }]);
  });

  it("applies the one attestation only when the file has no adult column", () => {
    const loose = parseRecipients("a@example.test");
    expect(recipientsToSend(loose, true)).toEqual([{ email: "a@example.test", adultConfirmed: true }]);
    expect(recipientsToSend(loose, false)).toEqual([{ email: "a@example.test", adultConfirmed: false }]);
    const csv = parseRecipients("email,adultConfirmed\na@example.test,false");
    expect(recipientsToSend(csv, true)[0].adultConfirmed).toBe(false);
  });

  it("summarizes the report by outcome and reason", () => {
    const summary = summarizeIssue({
      matched: [
        { email: "a@example.test", clientId: "u1", voucherId: "v1", issued: true },
        { email: "b@example.test", clientId: "u2", voucherId: "v2", issued: false },
      ],
      unmatched: [
        { email: "c@example.test", reason: "no_client_account" },
        { email: "nope", reason: "invalid_email" },
      ],
    });
    expect(summary).toMatchObject({ issued: 1, alreadyHad: 1, unmatched: 2 });
    expect(summary.byReason.no_client_account).toEqual(["c@example.test"]);
  });
});

describe("money", () => {
  it("formats the budget string without losing a centavo past the safe range", () => {
    expect(formatMinorString("1500")).toBe("₱15.00");
    expect(formatMinorString("-1500")).toBe("−₱15.00");
    expect(formatMinorString("0")).toBe("₱0.00");
    expect(formatMinorString("5")).toBe("₱0.05");
    expect(formatMinorString("90071992547409931")).toBe("₱900,719,925,474,099.31");
    expect(minorStringIsNegative("-1")).toBe(true);
    expect(minorStringIsNegative("-0")).toBe(false);
  });

  it("reads the voucher off an order, or nothing at all", () => {
    expect(orderVoucher({})).toBeNull();
    expect(
      orderVoucher({
        voucher: {
          id: "vch_1",
          campaignId: "vcamp_1",
          label: "GRIDGO-funded voucher",
          fundedBy: "GRIDGO",
          amountMinor: 1500,
          serviceFeeMinor: 1000,
          deliveryMinor: 500,
        },
        voucherDiscountMinor: 1500,
      }),
    ).toEqual({ amountMinor: 1500, serviceFeeMinor: 1000, deliveryMinor: 500 });
  });

  it("lists every order a log row names", () => {
    expect(ledgerOrderIds({ orderIds: ["o1", "o2"] })).toEqual(["o1", "o2"]);
    expect(ledgerOrderIds({ orderId: "o3" })).toEqual(["o3"]);
    expect(ledgerOrderIds({})).toEqual([]);
  });
});

describe("errors", () => {
  it("explains the API's codes in plain words", () => {
    expect(
      voucherErrorMessage(new ApiError(409, { error: "voucher_payment_reconciliation_required" }), "x"),
    ).toMatch(/submitted checkout/);
    expect(voucherErrorMessage(new ApiError(409, { error: "voucher_campaign_cap_reached" }), "x")).toMatch(
      /nothing was issued/,
    );
    expect(voucherErrorMessage(new ApiError(418, { error: "teapot" }), "fallback")).toBe("fallback");
  });
});
