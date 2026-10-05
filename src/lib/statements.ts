/**
 * An organization's spend statement as Operations reads it (gridgo-client#160,
 * contract "Statements" in `gridgo-api/docs/ORGANIZATION_MONEY_API.md`).
 *
 * The same data the organization exports from the client app: closed orders in
 * a Manila calendar period, what each cost after the organization discount,
 * and the officer recorded on it. It is not a tax document, and every screen
 * and export says so. Pure functions, unit tested.
 */

import type { StatementPeriod } from "@/lib/api/types";

/** The API refuses a custom period longer than this. */
export const STATEMENT_MAX_DAYS = 366;

export const STATEMENT_NOTICE =
  "Not a tax document. Official receipts are issued separately.";

export const PERIOD_CHOICES = [
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "custom", label: "Custom dates" },
] as const;

export type PeriodChoice = (typeof PERIOD_CHOICES)[number]["value"];

const DAY_MS = 86_400_000;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Today's date in Manila, the calendar the API counts periods in. */
export function manilaToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** The first day of this Manila month, for a custom range's starting value. */
export function manilaMonthStart(now = new Date()): string {
  return `${manilaToday(now).slice(0, 8)}01`;
}

/**
 * The period to ask for, or the reason a custom range cannot be asked for
 * yet (mirrors `400 invalid_statement_period`).
 */
export function statementPeriod(
  choice: PeriodChoice,
  from: string,
  to: string,
): { period: StatementPeriod } | { problem: string } {
  if (choice !== "custom") return { period: { period: choice } };
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    return { problem: "Choose a start and an end date." };
  }
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1) return { problem: "The end date is before the start date." };
  if (days > STATEMENT_MAX_DAYS) {
    return {
      problem: `A statement covers at most ${STATEMENT_MAX_DAYS} days. Shorten the range.`,
    };
  }
  return { period: { period: "custom", from, to } };
}

/** The file name the API gives the same export. */
export function statementFileName(
  period: { from: string; to: string },
  format: "pdf" | "csv",
): string {
  return `organization-statement-${period.from}-${period.to}.${format}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "1 Oct – 31 Oct 2026": the period's own calendar dates, never shifted by a time zone. */
export function describePeriod(period: { from: string; to: string }): string {
  const format = (value: string, withYear: boolean) => {
    const [year, month, day] = value.split("-");
    return `${Number(day)} ${MONTHS[Number(month) - 1]}${withYear ? ` ${year}` : ""}`;
  };
  const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4);
  return `${format(period.from, !sameYear)} – ${format(period.to, true)}`;
}

/** A user id as the API issues them; anything else never reaches a request path. */
export function isPlainId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export type OrganizationStanding = {
  label: string;
  tone: "success" | "info" | "error" | "neutral";
  icon: "circle-check" | "clock" | "circle-x" | "ban" | "circle-dot";
};

/** Where an organization's application stands, for the list's status chip. */
export function presentOrganizationStanding(
  status: string | null | undefined,
): OrganizationStanding {
  switch (status) {
    case "approved":
      return { label: "Approved", tone: "success", icon: "circle-check" };
    case "pending":
      return { label: "Under review", tone: "info", icon: "clock" };
    case "rejected":
      return { label: "Not approved", tone: "error", icon: "circle-x" };
    case "suspended":
      return { label: "Suspended", tone: "error", icon: "ban" };
    default:
      return { label: "No application", tone: "neutral", icon: "circle-dot" };
  }
}

/** Plain recovery copy for a statement read that failed. */
export function statementErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "organization_approval_required":
      return "Statements are only kept for organizations Operations has approved. This account is not approved, or its approval was withdrawn.";
    case "invalid_statement_period":
      return "That period cannot be read. Choose dates in order, at most 366 days apart.";
    case "statement_total_too_large":
      return "That period holds too much to total. Choose a shorter one.";
    case "invalid_statement_money":
      return "An order in this period has money the statement cannot add up. Tell engineering which organization this is.";
    default:
      return "The statement could not be loaded. Try again.";
  }
}
