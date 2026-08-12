/**
 * Announcement helpers — the rules that make a megaphone safe to hold.
 *
 * Everything here is pure so it can be tested without a browser: audience
 * order and copy, the lock-screen truncation budget, the accidental-resend
 * check against this session, and the plain-language reading of a send result.
 */

import { ApiError, isApiError } from "@/lib/api/client";
import type { Announcement, AnnouncementAudience } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export type AudienceChoice = {
  value: AnnouncementAudience;
  /** What the operator calls these people, never the API enum. */
  label: string;
  /** Why this group is worth interrupting — the thing that should be weighed. */
  reason: string;
};

/**
 * Narrow audiences first, "Everyone" last. Interrupting every phone GRIDGO has
 * — including ones that never signed in — should be a decision the operator
 * scrolls to, not the one already selected.
 */
export const AUDIENCE_CHOICES: readonly AudienceChoice[] = [
  {
    value: "clients",
    label: "Customers",
    reason:
      "People who order printing. Reach them about the app, pricing, or a service change.",
  },
  {
    value: "suppliers",
    label: "Print shops",
    reason:
      "Partners with jobs to run. Reach them about how work arrives or how they get paid.",
  },
  {
    value: "riders",
    label: "Riders",
    reason:
      "People out on deliveries. Reach them about dispatch, pickup rules, or safety.",
  },
  {
    value: "ops",
    label: "Operations",
    reason:
      "People running this portal. Reach them about a process change they all need today.",
  },
  {
    value: "everyone",
    label: "Everyone",
    reason:
      "Also reaches phones that have never signed in, or have signed out. Only for words that are safe for a stranger holding any phone.",
  },
] as const;

export function audienceLabel(audience: AnnouncementAudience | string): string {
  return (
    AUDIENCE_CHOICES.find((choice) => choice.value === audience)?.label ??
    "Unknown audience"
  );
}

/**
 * The audience as the tail of a sentence — "…right now: print shops."
 * `audienceLabel` is a heading word and reads wrong mid-sentence, where
 * "Everyone" has to spell out who that is.
 */
export function audienceReach(audience: AnnouncementAudience | string): string {
  switch (audience) {
    case "everyone":
      return "every signed-in account and every phone that never signed in";
    case "clients":
      return "customers";
    case "suppliers":
      return "print shops";
    case "riders":
      return "riders";
    case "ops":
      return "operations";
    default:
      return "this audience";
  }
}

/** Only `everyone` may land on a handset nobody has signed in on. */
export function audienceHitsStrangers(
  audience: AnnouncementAudience | string | null,
): boolean {
  return audience === "everyone";
}

// ---------------------------------------------------------------------------
// What a phone actually shows
// ---------------------------------------------------------------------------

/** Hard limits the API will accept. */
export const ANNOUNCEMENT_LIMITS = { title: 120, body: 500 } as const;

/**
 * Roughly what survives on a collapsed lock screen at a common handset width.
 * Approximate by nature — the rendered preview does the real truncation, these
 * only decide when to warn in words.
 */
export const LOCK_SCREEN_BUDGET = { title: 40, body: 110 } as const;

export function formatCount(count: number): string {
  return count.toLocaleString("en-PH");
}

export function phraseAccounts(count: number): string {
  return `${formatCount(count)} signed-in account${count === 1 ? "" : "s"}`;
}

export function phraseUnclaimed(count: number): string {
  return `${formatCount(count)} unsigned-in phone${count === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Accidental resend — this session only. There is no list API.
// ---------------------------------------------------------------------------

const RESEND_WINDOW_MINUTES = 120;

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export type AnnouncementDraft = {
  title: string;
  body: string;
  audience: AnnouncementAudience | null;
};

/**
 * The same words, to the same people, within the last two hours of *this*
 * session. Two identical announcements minutes apart is a real operator
 * mistake. There is no server list to check against.
 */
export function findRecentDuplicate(
  draft: AnnouncementDraft,
  recent: readonly Announcement[],
  nowMs: number,
  windowMinutes: number = RESEND_WINDOW_MINUTES,
): Announcement | null {
  if (!draft.audience) return null;
  const title = normalise(draft.title);
  const body = normalise(draft.body);
  if (!title && !body) return null;

  const cutoff = nowMs - windowMinutes * 60_000;

  for (const sent of recent) {
    const at = Date.parse(sent.at);
    if (!Number.isFinite(at) || at < cutoff) continue;
    if (sent.audience !== draft.audience) continue;
    if (normalise(sent.title) === title && normalise(sent.body) === body) {
      return sent;
    }
  }
  return null;
}

/** "4 minutes ago" — how fresh a mistake would be. */
export function describeAge(iso: string, nowMs: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "at an unknown time";

  const seconds = Math.round((nowMs - at) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "less than a minute ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Delivery: notifiedUsers + unclaimedDevices. Zero-zero is broken.
// ---------------------------------------------------------------------------

export type ReachPresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** One sentence saying whether this needs anyone's attention. */
  detail: string;
};

/**
 * A zero-zero result is a broken send. A partial count is normal — especially
 * for Everyone, where unsigned-in phones are a second population, not a miss.
 */
export function presentAnnouncementReach(
  notifiedUsers: number,
  unclaimedDevices: number,
  audience: AnnouncementAudience | string,
): ReachPresentation {
  if (notifiedUsers === 0 && unclaimedDevices === 0) {
    return {
      label: "Reached nobody",
      tone: "error",
      icon: "triangle-alert",
      detail:
        "No signed-in accounts and no unsigned-in phones took this. That is a broken send — check with engineering before trying again.",
    };
  }

  if (audience === "everyone") {
    if (notifiedUsers > 0 && unclaimedDevices > 0) {
      return {
        label: `${phraseAccounts(notifiedUsers)}, ${phraseUnclaimed(unclaimedDevices)}`,
        tone: "info",
        icon: "circle-check",
        detail:
          "Signed-in accounts got it in the app. Phones that never signed in, or signed out, got it on the lock screen. A partial count is normal.",
      };
    }
    if (notifiedUsers > 0) {
      return {
        label: phraseAccounts(notifiedUsers),
        tone: "success",
        icon: "circle-check",
        detail:
          "Every targeted signed-in account got it. No unsigned-in phones were registered to reach.",
      };
    }
    return {
      label: phraseUnclaimed(unclaimedDevices),
      tone: "info",
      icon: "circle-check",
      detail:
        "No signed-in accounts were notified. Phones that never signed in still got the lock-screen copy. A partial count is normal.",
    };
  }

  return {
    label: phraseAccounts(notifiedUsers),
    tone: "success",
    icon: "circle-check",
    detail: `Reached signed-in ${audienceReach(audience)}. Phones that never signed in cannot receive this — only Everyone reaches them.`,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Announcement-specific recovery copy. After a POST the operator's first
 * question is whether anything went out, so those messages say so plainly.
 */
export function announcementErrorMessage(err: unknown, fallback: string): string {
  if (!(isApiError(err) || err instanceof ApiError)) return fallback;

  switch (err.kind) {
    case "not_found":
      return "This API does not accept announcements yet. Nothing was sent.";
    case "unauthorized":
      return "Your session expired before this went out. Sign in again as Super Admin — nothing was sent.";
    case "forbidden":
      return "Sending an announcement is restricted to Super Admin. Nothing was sent.";
    case "validation":
      if (err.code === "invalid_announcement_title") {
        return "The title was refused. Keep it between 1 and 120 characters. Nothing was sent.";
      }
      if (err.code === "invalid_announcement_body") {
        return "The message was refused. Keep it between 1 and 500 characters. Nothing was sent.";
      }
      if (err.code === "invalid_announcement_audience") {
        return "Choose who this reaches, then send again. Nothing was sent.";
      }
      return "The announcement was refused. Check who it reaches and the wording, then try again. Nothing was sent.";
    case "conflict":
      return "The announcement was refused because something about it clashes with a recent send. Change the wording, then try again. Nothing was sent.";
    case "server":
      return "The announcement service failed while handling this. It may or may not have gone out — do not send again until you know.";
    default:
      return fallback;
  }
}
