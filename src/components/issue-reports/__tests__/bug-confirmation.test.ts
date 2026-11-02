import { describe, expect, it } from "vitest";

import {
  confirmBugErrorCopy,
  confirmBugNeedsReload,
  confirmBugState,
  confirmedLine,
  reporterLine,
  voucherPreview,
  voucherResult,
} from "@/components/issue-reports/bug-confirmation";
import { ApiError } from "@/lib/api/client";
import type { IssueReport, IssueReportBugConfirmation, IssueReportReporter } from "@/lib/api/types";

const triage = {
  validity: "unreviewed" as const,
  category: null,
  labels: [] as string[],
  duplicateOf: null,
  triagedBy: null,
  triagedAt: null,
};

const tester: IssueReportReporter = { id: "usr_ana", name: "Ana", tester: true, bugRewardAvailable: true };

const base: IssueReport = {
  id: "50d4f603-c50a-4e95-93f8-107a1cd8cf91",
  issue: "The rider map does not load",
  category: "bug",
  status: "new",
  publishedIn: null,
  createdAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-01T09:00:00.000Z",
  screenshots: [],
  triage,
  reporter: tester,
  bugConfirmation: null,
};

const confirmation = (over: Partial<IssueReportBugConfirmation> = {}): IssueReportBugConfirmation => ({
  confirmedAt: "2026-11-02T08:00:00.000Z",
  confirmedBy: { id: "usr_ops", name: "Lea" },
  voucherOutcome: "granted",
  voucherGranted: true,
  reward: { id: "trwd_1", status: "issued", amountMinor: 1500, voucherId: "vch_1" },
  ...over,
});

function apiError(status: number, code: string) {
  return new ApiError(status, { error: code });
}

describe("confirmBugState", () => {
  it("shows nothing against an API without the reporter fields", () => {
    const older: IssueReport = { ...base };
    delete older.reporter;
    delete older.bugConfirmation;
    expect(confirmBugState(older, "usr_ops")).toEqual({ kind: "unsupported" });
  });

  it("is ready for an anonymous or a signed-in report", () => {
    expect(confirmBugState(base, "usr_ops")).toEqual({ kind: "ready" });
    expect(confirmBugState({ ...base, reporter: null }, "usr_ops")).toEqual({ kind: "ready" });
  });

  it("refuses spam and duplicate reports with the way out", () => {
    const spam = confirmBugState({ ...base, triage: { ...triage, validity: "spam" } }, "usr_ops");
    expect(spam).toEqual({ kind: "blocked", reason: expect.stringMatching(/Marked spam/) });
    const dup = confirmBugState({ ...base, triage: { ...triage, validity: "duplicate" } }, "usr_ops");
    expect(dup).toEqual({ kind: "blocked", reason: expect.stringMatching(/original report/) });
  });

  it("refuses the staff member's own report before the press", () => {
    expect(confirmBugState(base, "usr_ana")).toEqual({
      kind: "blocked",
      reason: "You sent this report, so a teammate confirms it.",
    });
  });

  it("is confirmed once the API carries a confirmation, whatever the verdict", () => {
    const done = { ...base, triage: { ...triage, validity: "spam" as const }, bugConfirmation: confirmation() };
    expect(confirmBugState(done, "usr_ana").kind).toBe("confirmed");
  });
});

describe("before confirming", () => {
  it("names the reporter and whether they are a tester", () => {
    expect(reporterLine(tester)).toBe("Ana · Founding Tester");
    expect(reporterLine({ ...tester, tester: false, name: null })).toBe("The reporter · Not a Founding Tester");
    expect(reporterLine(null)).toBe("Sent without signing in");
  });

  it("says whether this reporter will get the voucher", () => {
    expect(voucherPreview(base)).toEqual({ rewarded: true, text: "Ana gets a one-time ₱15.00 voucher." });
    expect(voucherPreview({ ...base, reporter: { ...tester, bugRewardAvailable: false } }).text).toBe(
      "No voucher: Ana already got their bug-report voucher.",
    );
    expect(voucherPreview({ ...base, reporter: { ...tester, tester: false, bugRewardAvailable: false } }).text).toBe(
      "No voucher: Ana is not a Founding Tester.",
    );
    expect(voucherPreview({ ...base, reporter: null })).toEqual({
      rewarded: false,
      text: "No voucher: it was sent without signing in.",
    });
  });
});

describe("voucherResult", () => {
  it("puts every outcome in plain words", () => {
    expect(voucherResult(confirmation()).label).toBe("₱15.00 voucher sent");
    expect(
      voucherResult(confirmation({ voucherOutcome: "paused", voucherGranted: false, reward: { id: "t", status: "paused", amountMinor: 1500, voucherId: null } })),
    ).toMatchObject({ label: "Voucher on hold", tone: "warning", detail: expect.stringMatching(/Founding testers/) });
    expect(voucherResult(confirmation({ voucherOutcome: "already_rewarded", voucherGranted: false, reward: null }))).toMatchObject({
      label: "No voucher",
      detail: "The reporter already got their bug-report voucher.",
    });
    expect(voucherResult(confirmation({ voucherOutcome: "not_tester", voucherGranted: false, reward: null })).detail).toBe(
      "The reporter is not a Founding Tester.",
    );
    expect(voucherResult(confirmation({ voucherOutcome: "no_reporter", voucherGranted: false, reward: null })).detail).toBe(
      "It was sent without signing in.",
    );
  });

  it("follows a paused voucher Super Admin later resumed or voided", () => {
    const resumed = confirmation({ voucherOutcome: "paused", voucherGranted: true });
    expect(voucherResult(resumed)).toMatchObject({ label: "₱15.00 voucher sent", detail: "Sent when Super Admin resumed it." });
    const voidedOnHold = confirmation({
      voucherOutcome: "paused",
      voucherGranted: false,
      reward: { id: "t", status: "voided", amountMinor: 1500, voucherId: null },
    });
    expect(voucherResult(voidedOnHold).label).toBe("Voucher voided");
    const voidedAfter = confirmation({ reward: { id: "t", status: "voided", amountMinor: 1500, voucherId: "v" } });
    expect(voucherResult(voidedAfter).detail).toBe("The ₱15.00 voucher was sent, then voided.");
  });

  it("says who confirmed", () => {
    expect(confirmedLine(confirmation())).toMatch(/^Confirmed by Lea on /);
    expect(confirmedLine(confirmation({ confirmedBy: null }))).toMatch(/^Confirmed by a teammate on /);
  });
});

describe("refusals", () => {
  it("maps the API's codes to plain words", () => {
    expect(confirmBugErrorCopy(apiError(409, "issue_report_not_confirmable"))).toMatch(/Spam and duplicate/);
    expect(confirmBugErrorCopy(apiError(403, "issue_report_self_confirmation"))).toBe(
      "You sent this report, so a teammate has to confirm it.",
    );
    expect(confirmBugErrorCopy(apiError(403, "forbidden"))).toBe("Your account cannot confirm bugs.");
    expect(confirmBugErrorCopy(new Error("offline"))).toBe("Could not confirm. Nothing changed. Try again.");
  });

  it("reloads only when the report changed underneath", () => {
    expect(confirmBugNeedsReload(apiError(409, "issue_report_not_confirmable"))).toBe(true);
    expect(confirmBugNeedsReload(apiError(403, "issue_report_self_confirmation"))).toBe(false);
  });
});
