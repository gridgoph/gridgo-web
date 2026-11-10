/**
 * Rules and words for the Google Play testers page
 * (contract `gridgo-api/docs/TESTER_PROGRAM_API.md`).
 *
 * Two clocks, never mixed up: GRIDGO's daily check-in streak (a missed day
 * restarts it at Day 1) and Google Play's closed-test clock (continuous opt-in,
 * typed in by Operations from Play Console). A red day is ours only.
 */

import { isApiError } from "@/lib/api/client";
import type {
  PlayOptInStep,
  PlayOptInSummary,
  TesterApp,
  TesterDayState,
} from "@/lib/api/play-testers";
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

const ACCESS_COPY = "Only Operations and Super Admin can open the Play testers page.";

/** Read failures: who may open it, or how to recover. */
export function rosterLoadError(err: unknown): string {
  if (!isApiError(err))
    return "Could not reach the API. Check the connection, then retry.";
  if (err.code === "test_operations_forbidden") {
    return "Test operations logins cannot open the Play testers page.";
  }
  if (err.status === 403) return ACCESS_COPY;
  return "Could not load testers. Retry.";
}

/** Inline copy under the email field. */
export function addTesterError(err: unknown, app: TesterApp): string {
  if (!isApiError(err))
    return "Could not reach the API. Check the connection, then retry.";
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
  if (!isApiError(err))
    return "Could not reach the API. Check the connection, then retry.";
  if (err.status === 403) return ACCESS_COPY;
  if (err.kind === "validation") return "Check the value. Dates cannot be in the future.";
  return "Could not save. Try again.";
}

// ---------------------------------------------------------------------------
// Android Play opt-in campaign (contract `gridgo-api/docs/PLAY_OPTIN_API.md`).
// "Opted in" here is GRIDGO's signal (a Play install the app reported, or a
// staff mark). Play Console's own figure is typed in and shown apart.

/** The fixed words every opt-in push and Home card carries (set by the API). */
export const PLAY_OPTIN_COPY = "Help us launch GRIDGO on Play, become a tester.";

/** What the person last did, in the flow's order. */
export const PLAY_OPTIN_STEP_LABEL: Record<PlayOptInStep, string> = {
  confirm_gmail: "Tapped",
  join_group: "Gmail confirmed",
  // Joined automatically, or only opened the join link: never claim membership.
  open_optin: "Group step",
  install_from_play: "Opened opt-in",
  opted_in: "Opted in",
};

/** Sort order for the Last step column: further along sorts higher. */
export const PLAY_OPTIN_STEP_ORDER: Record<PlayOptInStep, number> = {
  confirm_gmail: 1,
  join_group: 2,
  open_optin: 3,
  install_from_play: 4,
  opted_in: 5,
};

/** Mirrors the API's `invalid_opt_in_url` check. */
export function validOptInUrl(input: string): boolean {
  const url = parseHttps(input, "play.google.com");
  return url !== null && /^\/apps\/testing\/[a-zA-Z0-9_.]+$/.test(url.pathname);
}

/** Mirrors the API's `invalid_group_join_url` check. */
export function validGroupJoinUrl(input: string): boolean {
  const url = parseHttps(input, "groups.google.com");
  return url !== null && /^\/(?:a\/[^/]+\/)?g\/[^/]+(?:\/.*)?$/.test(url.pathname);
}

function parseHttps(input: string, host: string): URL | null {
  if (input.length > 2048 || /[\s\x00-\x1f\x7f]/.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname !== host) return null;
    if (url.port || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** A whole target from 1 to 10000, or null. */
export function parseTarget(input: string): number | null {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 10_000 ? n : null;
}

/**
 * Why Send would be refused, before the click, or null when it can go.
 * Mirrors `409 campaign_disabled` / `group_not_configured`.
 */
export function broadcastBlocker(
  optIn: Pick<PlayOptInSummary, "campaignEnabled" | "groupMode" | "groupJoinUrl">,
  productionApproved: boolean,
): string | null {
  if (productionApproved) return "Production is approved. The campaign is over.";
  if (!optIn.campaignEnabled) return "Turn the campaign on first.";
  if (optIn.groupMode === "link" && !optIn.groupJoinUrl)
    return "Add the group link first.";
  return null;
}

/**
 * A refused send (`4xx`) is certain: the API answered before writing anything.
 * A lost connection or a server error is not: the broadcast may have committed
 * and the reply been lost, so the page never says "nothing was sent" and never
 * offers a one-tap resend.
 */
export type BroadcastFailure = { message: string; uncertain: boolean };

export const BROADCAST_UNCERTAIN =
  "Could not confirm the send. It may have gone out. Check a tester's phone before sending again.";

export function broadcastError(err: unknown): BroadcastFailure {
  if (!isApiError(err) || err.status >= 500 || err.status < 400) {
    return { message: BROADCAST_UNCERTAIN, uncertain: true };
  }
  switch (err.code) {
    case "campaign_disabled":
      return {
        message: "The campaign is off or production is approved. Nothing was sent.",
        uncertain: false,
      };
    case "group_not_configured":
      return { message: "Add the group link first. Nothing was sent.", uncertain: false };
    default:
      return {
        message:
          err.status === 403
            ? ACCESS_COPY
            : "The API refused the send. Nothing was sent.",
        uncertain: false,
      };
  }
}

export function markOptedInError(err: unknown): string {
  if (!isApiError(err))
    return "Could not reach the API. Check the connection, then retry.";
  if (err.code === "user_not_found")
    return "This account no longer has this app. The list is refreshed.";
  if (err.status === 403) return ACCESS_COPY;
  return "Could not mark opted in. Try again.";
}

export function campaignSettingsError(err: unknown): string {
  if (!isApiError(err))
    return "Could not reach the API. Check the connection, then retry.";
  switch (err.code) {
    case "invalid_opt_in_url":
      return "Use the Play testing link: https://play.google.com/apps/testing/…";
    case "invalid_group_join_url":
      return "Use the Google Group link: https://groups.google.com/g/…";
    case "invalid_target":
      return "Enter a whole number from 1 to 10,000.";
    case "invalid_daily_reminder_hour":
      return "Choose an hour from 12:00 AM to 11:00 PM.";
    case "invalid_daily_reminder_enabled":
      return "Turn the daily reminder on or off, then retry.";
    default:
      return settingsError(err);
  }
}

/** The 24 hours the daily reminder can go out at, 0–23 in Asia/Manila. */
export const REMINDER_HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h);

/** "10:00 AM (Manila)". The hour is already Manila's, so no time zone math. */
export function reminderHourLabel(hour: number, withZone = true): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const label = `${h12}:00 ${hour < 12 ? "AM" : "PM"}`;
  return withZone ? `${label} (Manila)` : label;
}

/** "Sent to 8 accounts." Zero is a real outcome here: nobody is still on the APK. */
export function broadcastReach(notifiedUsers: number): string {
  if (notifiedUsers === 0) return "Sent to nobody. No Android APK user is still waiting.";
  return `Sent to ${notifiedUsers} ${notifiedUsers === 1 ? "account" : "accounts"}.`;
}
