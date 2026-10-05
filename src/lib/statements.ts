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

/** "1 Oct – 31 Oct 2026", read in Manila. */
export function describePeriod(period: { from: string; to: string }): string {
  const format = (value: string, withYear: boolean) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-PH", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4);
  return `${format(period.from, !sameYear)} – ${format(period.to, true)}`;
}
