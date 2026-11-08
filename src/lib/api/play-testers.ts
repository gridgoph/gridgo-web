/**
 * Google Play 14-day closed test: Operations' tester roster
 * (contract `gridgo-api/docs/TESTER_PROGRAM_API.md`).
 *
 * Operations and Super Admin only. A test operations login is refused
 * (`403 test_operations_forbidden`). Separate from Founding Tester: nothing
 * here earns a reward. This is the only file that knows these field names.
 */

import { apiRequest } from "@/lib/api/client";

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

export type PlayTesterRoster = {
  app: TesterApp;
  stats: PlayTesterStats;
  testers: PlayTester[];
};

export type PlayTesterSettingsPatch = {
  playClockStartDate?: string | null;
  optedInCount?: number;
  productionApprovedAt?: string | null;
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
