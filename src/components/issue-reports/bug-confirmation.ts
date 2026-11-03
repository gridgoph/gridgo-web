/**
 * Confirm real bug: staff confirm a report is a real bug, and a tester who
 * sent it earns a one-time voucher (decided 26 Oct 2026). Contract "Confirm
 * real bug (dashboard)" in gridgo-api docs/CLIENT_HOME_API.md. This file only
 * explains the API's decision; it never decides who gets a voucher.
 */

import { isApiError } from "@/lib/api/client";
import type { IssueReport, IssueReportBugConfirmation, IssueReportReporter } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import type { StatePresentation } from "@/lib/order-state";

/**
 * The voucher's face value before a confirmation carries its own amount
 * (`reward.amountMinor`, 1500 in the contract). Display only; the API sets it.
 */
export const BUG_REWARD_MINOR = 1500;

export type ConfirmBugState =
  /** An API before the bug-report voucher: show nothing. */
  | { kind: "unsupported" }
  | { kind: "confirmed"; confirmation: IssueReportBugConfirmation }
  /** The action shows disabled, with the reason beside it. */
  | { kind: "blocked"; reason: string }
  | { kind: "ready" };

export function confirmBugState(report: IssueReport, viewerId: string | null | undefined): ConfirmBugState {
  if (report.bugConfirmation) return { kind: "confirmed", confirmation: report.bugConfirmation };
  if (report.reporter === undefined && report.bugConfirmation === undefined) return { kind: "unsupported" };
  const validity = report.triage?.validity;
  if (validity === "spam") {
    return { kind: "blocked", reason: "Marked spam. If it is a real bug, change the verdict first." };
  }
  if (validity === "duplicate") {
    return { kind: "blocked", reason: "Marked duplicate. Confirm the original report instead." };
  }
  if (viewerId && report.reporter?.id === viewerId) {
    return { kind: "blocked", reason: "You sent this report, so a teammate confirms it." };
  }
  return { kind: "ready" };
}

function reporterName(reporter: IssueReportReporter): string {
  return reporter.name?.trim() || "The reporter";
}

/** "Ana · Founding Tester", or how an anonymous report arrived. */
export function reporterLine(reporter: IssueReportReporter | null | undefined): string {
  if (!reporter) return "Sent without signing in";
  return `${reporterName(reporter)} · ${reporter.tester ? "Founding Tester" : "Not a Founding Tester"}`;
}

/** What confirming now would do for the reporter, from `bugRewardAvailable`. */
export function voucherPreview(report: IssueReport): { rewarded: boolean; text: string } {
  const reporter = report.reporter;
  const amount = formatPhp(BUG_REWARD_MINOR);
  if (!reporter) return { rewarded: false, text: "No voucher: it was sent without signing in." };
  if (reporter.bugRewardAvailable) {
    return { rewarded: true, text: `${reporterName(reporter)} gets a one-time ${amount} voucher.` };
  }
  if (reporter.tester) {
    return { rewarded: false, text: `No voucher: ${reporterName(reporter)} already got their bug-report voucher.` };
  }
  return { rewarded: false, text: `No voucher: ${reporterName(reporter)} is not a Founding Tester.` };
}

export type VoucherResult = StatePresentation & { detail: string | null };

/** `voucherOutcome` in plain words, with the entitlement's live state. */
export function voucherResult(confirmation: IssueReportBugConfirmation): VoucherResult {
  const amount = formatPhp(confirmation.reward?.amountMinor ?? BUG_REWARD_MINOR);
  const status = confirmation.reward?.status;
  switch (confirmation.voucherOutcome) {
    case "granted":
      return status === "voided"
        ? { label: "Voucher voided", tone: "neutral", icon: "ban", detail: `The ${amount} voucher was sent, then voided.` }
        : { label: `${amount} voucher sent`, tone: "success", icon: "circle-check", detail: "Valid 30 days." };
    case "paused":
      if (confirmation.voucherGranted) {
        return status === "voided"
          ? { label: "Voucher voided", tone: "neutral", icon: "ban", detail: `The ${amount} voucher was sent, then voided.` }
          : {
              label: `${amount} voucher sent`,
              tone: "success",
              icon: "circle-check",
              detail: "Sent when Super Admin resumed it.",
            };
      }
      return status === "voided"
        ? {
            label: "Voucher voided",
            tone: "neutral",
            icon: "ban",
            detail: "It was on hold for the tester budget and voided before it went out.",
          }
        : {
            label: "Voucher on hold",
            tone: "warning",
            icon: "clock",
            detail: `This month's tester budget is used up. Super Admin can resume the ${amount} voucher in Founding testers.`,
          };
    case "already_rewarded":
      return {
        label: "No voucher",
        tone: "neutral",
        icon: "circle-dashed",
        detail: "The reporter already got their bug-report voucher.",
      };
    case "not_tester":
      return { label: "No voucher", tone: "neutral", icon: "circle-dashed", detail: "The reporter is not a Founding Tester." };
    case "no_reporter":
      return { label: "No voucher", tone: "neutral", icon: "circle-dashed", detail: "It was sent without signing in." };
  }
}

export function confirmedLine(confirmation: IssueReportBugConfirmation): string {
  return `Confirmed by ${confirmation.confirmedBy?.name?.trim() || "a teammate"} on ${formatDateTime(confirmation.confirmedAt)}.`;
}

/** The API's refusal in plain words; never the API's own message. */
export function confirmBugErrorCopy(err: unknown): string {
  if (isApiError(err)) {
    if (err.code === "issue_report_not_confirmable") {
      return "Spam and duplicate reports cannot be confirmed. Confirm the original report, or change the verdict first.";
    }
    if (err.code === "issue_report_self_confirmation") return "You sent this report, so a teammate has to confirm it.";
    if (err.code === "issue_report_not_found") return "This report no longer exists. Press Refresh.";
    if (err.code === "tester_budget_overflow") {
      return "The tester budget could not take this voucher. Nothing was confirmed. Ask Super Admin to check the budget.";
    }
    if (err.kind === "forbidden") return "Your account cannot confirm bugs.";
  }
  return "Could not confirm. Nothing changed. Try again.";
}

/** A refusal that means the report changed under us: reload it. */
export function confirmBugNeedsReload(err: unknown): boolean {
  return isApiError(err) && (err.code === "issue_report_not_confirmable" || err.code === "issue_report_not_found");
}
