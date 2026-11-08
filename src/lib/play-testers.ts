/**
 * Rules and words for the Google Play testers page
 * (contract `gridgo-api/docs/TESTER_PROGRAM_API.md`).
 *
 * Two clocks, never mixed up: GRIDGO's daily check-in streak (a missed day
 * restarts it at Day 1) and Google Play's closed-test clock (continuous opt-in,
 * typed in by Operations from Play Console). A red day is ours only.
 */

import { isApiError } from "@/lib/api/client";
import type { TesterApp, TesterDayState } from "@/lib/api/play-testers";
import { manilaDayStart, manilaToday } from "@/lib/audit";

export const RUN_DAYS = 14;

export const TESTER_APPS: readonly { app: TesterApp; label: string; noun: string }[] = [
  { app: "client", label: "Client", noun: "client" },
  { app: "supplier", label: "Shop", noun: "shop" },
  { app: "rider", label: "Rider", noun: "rider" },
];

export function testerAppFrom(value: string | null): TesterApp {
  return value === "supplier" || value === "rider" ? value : "client";
}

export function testerAppLabel(app: TesterApp): string {
  return TESTER_APPS.find((choice) => choice.app === app)?.label ?? app;
}

export const DAY_STATE_LABEL: Record<TesterDayState, string> = {
  checked_in: "Checked in",
  missed: "Missed",
  today: "Today",
  before_start: "Not added yet",
};

/** `2026-11-07` → `7 Nov`, read as a calendar date (no time zone shift). */
export function shortDay(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** `2026-11-07` → `Sat 7 Nov`, for a day box's accessible name. */
export function longDay(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** A timestamp's Manila calendar date, `YYYY-MM-DD`. */
export function manilaDateOf(iso: string): string {
  return manilaToday(Date.parse(iso));
}

/**
 * Which day of Google's 14 the Play clock is on, counting its start day as
 * Day 1. Null before it starts or with no date. Never read from our streak.
 */
export function playClockDay(start: string | null, today: string): number | null {
  if (!start) return null;
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
  return Number.isFinite(days) && days >= 0 ? days + 1 : null;
}

/**
 * The approval timestamp for a chosen Manila date. The API refuses a time
 * after its own clock, so today is "now" and an earlier day is its start.
 */
export function approvalTimestamp(date: string, now: number = Date.now()): string {
  return date >= manilaToday(now) ? new Date(now).toISOString() : manilaDayStart(date);
}

/** A whole, nonnegative count the API's integer column takes, or null. */
export function parseOptedIn(input: string): number | null {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null;
}

const ACCESS_COPY =
  "Only Operations and Super Admin can open the Play testers page.";

/** Read failures: who may open it, or how to recover. */
export function rosterLoadError(err: unknown): string {
  if (!isApiError(err)) return "Could not reach the API. Check the connection, then retry.";
  if (err.code === "test_operations_forbidden") {
    return "Test operations logins cannot open the Play testers page.";
  }
  if (err.status === 403) return ACCESS_COPY;
  return "Could not load testers. Retry.";
}

/** Inline copy under the email field. */
export function addTesterError(err: unknown, app: TesterApp): string {
  if (!isApiError(err)) return "Could not reach the API. Check the connection, then retry.";
  const noun = TESTER_APPS.find((choice) => choice.app === app)?.noun ?? "matching";
  switch (err.code) {
    case "invalid_email":
      return "Enter a full email address.";
    case "user_not_found":
      return "No GRIDGO account uses this email. Check the spelling.";
    case "already_enrolled":
      return `Already testing the ${testerAppLabel(app)} app.`;
    case "role_mismatch":
      return `This account has no ${noun} membership. Add it under its own app.`;
    case "ambiguous_email":
      return "More than one account uses this email. Ask the tester for another address.";
    case "test_operations_forbidden":
      return "Test operations logins cannot add testers.";
    default:
      return err.status === 403 ? ACCESS_COPY : "Could not add the tester. Try again.";
  }
}

export function removeTesterError(err: unknown): string {
  if (isApiError(err) && err.code === "not_enrolled") {
    return "Already removed. The list is refreshed.";
  }
  if (isApiError(err) && err.status === 403) return ACCESS_COPY;
  return "Could not remove the tester. Try again.";
}

export function settingsError(err: unknown): string {
  if (!isApiError(err)) return "Could not reach the API. Check the connection, then retry.";
  if (err.status === 403) return ACCESS_COPY;
  if (err.kind === "validation") return "Check the value. Dates cannot be in the future.";
  return "Could not save. Try again.";
}
