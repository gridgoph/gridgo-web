/**
 * Google Play 14-day closed test: Operations' tester roster
 * (contract `gridgo-api/docs/TESTER_PROGRAM_API.md`).
 *
 * Operations and Super Admin only. A test operations login is refused
 * (`403 test_operations_forbidden`). Separate from Founding Tester: nothing
 * here earns a reward. This is the only file that knows these field names.
 */

import { apiRequest } from "@/lib/api/client";
import type { Announcement } from "@/lib/api/types";

export type TesterApp = "client" | "supplier" | "rider";

export type TesterDayState = "checked_in" | "missed" | "today" | "before_start";

export type TesterDay = { date: string; state: TesterDayState };

export type PlayTester = {
  userId: string;
  name: string;
  email: string;
  role: string;
  addedAt: string;
  /** The next day to check, or today's once checked in. Starts again at 1 after a gap. */
  day: number;
  streak: number;
  lastCheckInDate: string | null;
  latestVersion: string | null;
  /** No check-in for 3+ Manila days. Not evidence of leaving Google's track. */
  stoppedCheckingIn: boolean;
  /** Exactly 14, oldest first. */
  days: TesterDay[];
  /** There is no "done": Google never says whether feedback was left. */
  feedback: { shownCount: number; tappedAt: string | null; dismissedCount: number };
};

export type PlayTesterStats = {
  activeToday: number;
  fullStreak: number;
  needed: number;
  /** Typed in from Play Console, `YYYY-MM-DD`. */
  playClockStartDate: string | null;
  optedInCount: number;
  productionApprovedAt: string | null;
};

/**
 * Where an unfinished person got to in the Android opt-in flow
 * (contract `gridgo-api/docs/PLAY_OPTIN_API.md`). `opted_in` never appears
 * in the unfinished list.
 */
export type PlayOptInStep =
  | "confirm_gmail"
  | "join_group"
  | "open_optin"
  | "install_from_play"
  | "opted_in";

export type PlayOptInUnfinished = {
  userId: string;
  name: string | null;
  app: TesterApp;
  /** Null until they confirm a Gmail. */
  gmail: string | null;
  lastStep: PlayOptInStep;
  at: string;
};

/** `automatic`: the API adds the Gmail to the Google Group itself. `link`: they join by the group link. */
export type PlayOptInGroupMode = "automatic" | "link";

export type PlayOptInSummary = {
  campaignEnabled: boolean;
  target: number;
  groupMode: PlayOptInGroupMode;
  optInUrl: string;
  groupJoinUrl: string | null;
  /** GRIDGO's signal: Play installs reported by the app plus staff marks. */
  optedInCount: number;
  /** Of those, first seen from a Play install. */
  detectedPlayCount: number;
  /** The figure typed in from Play Console (`stats.optedInCount`, 0 when unset). */
  playConsoleOptedInCount: number;
  /** At most 500, newest activity first. */
  unfinished: PlayOptInUnfinished[];
};

export type PlayTesterRoster = {
  app: TesterApp;
  stats: PlayTesterStats;
  testers: PlayTester[];
  /** Absent on an API without the Play opt-in campaign. */
  playOptIn?: PlayOptInSummary;
};

export type PlayTesterSettingsPatch = {
  playClockStartDate?: string | null;
  optedInCount?: number;
  productionApprovedAt?: string | null;
  campaignEnabled?: boolean;
  /** HTTPS `play.google.com/apps/testing/<package>`. */
  optInUrl?: string;
  /** HTTPS `groups.google.com/g/…` (or `/a/<domain>/g/…`), or null to clear. */
  groupJoinUrl?: string | null;
  /** 1–10000. */
  target?: number;
};

export async function listPlayTesters(app: TesterApp): Promise<PlayTesterRoster> {
  return apiRequest<PlayTesterRoster>(`/ops/testers?app=${encodeURIComponent(app)}`);
}

/** Exact account email; `404 user_not_found`, `409 already_enrolled`, `400 role_mismatch`. */
export async function addPlayTester(app: TesterApp, email: string): Promise<void> {
  await apiRequest<{ ok: true }>("/ops/testers", {
    method: "POST",
    body: JSON.stringify({ app, email }),
  });
}

/** Ends the enrolment; check-ins and feedback history are kept. */
export async function removePlayTester(app: TesterApp, userId: string): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/ops/testers/${encodeURIComponent(app)}/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function updatePlayTesterSettings(
  app: TesterApp,
  patch: PlayTesterSettingsPatch,
): Promise<void> {
  await apiRequest<{ ok: true }>("/ops/testers/settings", {
    method: "PATCH",
    body: JSON.stringify({ app, ...patch }),
  });
}

/**
 * Staff confirmation that this person opted in (sticky, audited). Enrols them
 * unless Operations removed them before. `404 user_not_found`.
 */
export async function markPlayOptedIn(app: TesterApp, userId: string): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/ops/testers/${encodeURIComponent(app)}/${encodeURIComponent(userId)}/opt-in`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/**
 * Pushes the opt-in notice to this app's Android APK users who have not opted
 * in. Every call is a new send; there is no unsend.
 * `409 campaign_disabled` / `group_not_configured`.
 */
export async function sendPlayOptInBroadcast(app: TesterApp): Promise<Announcement> {
  const result = await apiRequest<{ announcement: Announcement }>("/ops/testers/broadcast", {
    method: "POST",
    body: JSON.stringify({ app }),
  });
  return result.announcement;
}
