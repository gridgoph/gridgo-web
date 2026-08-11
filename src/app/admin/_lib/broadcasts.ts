/**
 * Push broadcast helpers — the rules that make a megaphone safe to hold.
 *
 * Everything here is pure so it can be tested without a browser: the
 * destination allow-list, the lock-screen truncation budget, the
 * accidental-resend check, and the plain-language reading of a best-effort
 * delivery result.
 */

import { ApiError, isApiError } from "@/lib/api/client";
import type { Broadcast, BroadcastAudience } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export type AudienceChoice = {
  value: BroadcastAudience;
  /** What the operator calls these people, never the API enum. */
  label: string;
  /** Why this group is worth interrupting — the thing that should be weighed. */
  reason: string;
};

/**
 * Narrow audiences first, "Everyone" last. Interrupting every phone GRIDGO has
 * should be a decision the operator scrolls to, not the one already selected.
 */
export const AUDIENCE_CHOICES: readonly AudienceChoice[] = [
  {
    value: "client",
    label: "Customers",
    reason: "People who order printing. Reach them about the app, pricing, or a service change.",
  },
  {
    value: "supplier",
    label: "Print shops",
    reason: "Partners with jobs to run. Reach them about how work arrives or how they get paid.",
  },
  {
    value: "rider",
    label: "Riders",
    reason: "People out on deliveries. Reach them about dispatch, pickup rules, or safety.",
  },
  {
    value: "all",
    label: "Everyone",
    reason: "Every customer, print shop and rider at once. Only for something all three need on the same day.",
  },
] as const;

export function audienceLabel(audience: BroadcastAudience | string): string {
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
export function audienceReach(audience: BroadcastAudience | string): string {
  switch (audience) {
    case "all":
      return "every customer, print shop and rider";
    case "client":
      return "customers";
    case "supplier":
      return "print shops";
    case "rider":
      return "riders";
    default:
      return "this audience";
  }
}

// ---------------------------------------------------------------------------
// What a phone actually shows
// ---------------------------------------------------------------------------

/** Hard limits on the composed message. */
export const BROADCAST_LIMITS = { title: 65, body: 200 } as const;

/**
 * Roughly what survives on a collapsed lock screen at a common handset width.
 * Approximate by nature — the rendered preview does the real truncation, these
 * only decide when to warn in words.
 */
export const LOCK_SCREEN_BUDGET = { title: 40, body: 110 } as const;

export function formatDeviceCount(count: number): string {
  return count.toLocaleString("en-PH");
}

/** Plural-safe "1,240 phones" / "1 phone". */
export function phrasePhones(count: number): string {
  return `${formatDeviceCount(count)} phone${count === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Destination — untrusted operator input
// ---------------------------------------------------------------------------

/**
 * The rule, in one sentence: a broadcast may only link to https on
 * talasora.com or one of its subdomains.
 *
 * A GRIDGO notification is trusted because GRIDGO sent it. An arbitrary
 * address typed into this box would ride that trust straight onto a lock
 * screen, which is what a phishing message is. The API must enforce the same
 * rule; this side exists so the portal never offers what the API will refuse.
 */
export const LINK_ROOT_DOMAIN = "talasora.com";

/** The captain's first broadcast points here. */
export const EXAMPLE_DESTINATION = "https://gridgo.talasora.com/download";

export type DestinationCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

export function describeLinkRule(): string {
  return `Links must start with https:// and sit on ${LINK_ROOT_DOMAIN} or one of its subdomains — for example ${EXAMPLE_DESTINATION}.`;
}

export function validateDestination(raw: string): DestinationCheck {
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      ok: false,
      reason: "Enter a link, or switch this broadcast to open the app instead.",
    };
  }
  if (/[\s\u0000-\u001f]/.test(trimmed)) {
    return {
      ok: false,
      reason:
        "A link cannot contain spaces or line breaks. Paste the address exactly as the browser shows it.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: `That is not a complete web address. Start with https:// — for example ${EXAMPLE_DESTINATION}.`,
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      reason:
        "Only https links can be sent. Anything else is not protected on the way to the phone.",
    };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason:
        "A link carrying a username or password cannot be sent. That shape is how a fake address is disguised as a real one.",
    };
  }
  if (parsed.port) {
    return {
      ok: false,
      reason: `A link with a port number cannot be sent. Use the plain address, without :${parsed.port}.`,
    };
  }

  const host = parsed.hostname.toLowerCase();
  const onOwnDomain =
    host === LINK_ROOT_DOMAIN || host.endsWith(`.${LINK_ROOT_DOMAIN}`);

  if (!onOwnDomain) {
    return {
      ok: false,
      reason: `${host} is not a GRIDGO address, so this cannot be sent. People trust this notification because GRIDGO sent it — an outside link would turn that trust into a phishing message with our name on it. ${describeLinkRule()}`,
    };
  }

  return { ok: true, url: parsed.toString() };
}

// ---------------------------------------------------------------------------
// Accidental resend
// ---------------------------------------------------------------------------

const RESEND_WINDOW_MINUTES = 120;

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export type BroadcastDraft = {
  title: string;
  body: string;
  audience: BroadcastAudience | null;
};

/**
 * The same words, to the same people, within the last two hours. Two identical
 * broadcasts minutes apart is a real operator mistake, so it gets said out loud
 * rather than left for the operator to spot in a list.
 */
export function findRecentDuplicate(
  draft: BroadcastDraft,
  recent: readonly Broadcast[],
  nowMs: number,
  windowMinutes: number = RESEND_WINDOW_MINUTES,
): Broadcast | null {
  if (!draft.audience) return null;
  const title = normalise(draft.title);
  const body = normalise(draft.body);
  if (!title && !body) return null;

  const cutoff = nowMs - windowMinutes * 60_000;

  for (const sent of recent) {
    const at = Date.parse(sent.sentAt);
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
// Delivery is best effort
// ---------------------------------------------------------------------------

export type DeliveryPresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** One sentence saying whether this needs anyone's attention. */
  detail: string;
};

/**
 * "820 of 1,240 delivered" is a normal result and must not read as failure.
 * Zero delivered is not normal and must.
 */
export function presentDelivery(
  deliveredCount: number,
  failedCount: number,
): DeliveryPresentation {
  const total = deliveredCount + failedCount;

  if (total === 0) {
    return {
      label: "No phones to reach",
      tone: "neutral",
      icon: "clock",
      detail:
        "Nobody in this audience had a phone registered for notifications when this went out.",
    };
  }
  if (deliveredCount === 0) {
    return {
      label: "Reached no phones",
      tone: "error",
      icon: "triangle-alert",
      detail: `None of the ${phrasePhones(total)} took this. That points at the notification service rather than the message — check with engineering before sending it again.`,
    };
  }
  if (failedCount === 0) {
    return {
      label: `Reached all ${formatDeviceCount(total)}`,
      tone: "success",
      icon: "circle-check",
      detail: "Every registered phone in this audience took it.",
    };
  }
  return {
    label: `Reached ${formatDeviceCount(deliveredCount)} of ${formatDeviceCount(total)}`,
    tone: "info",
    icon: "circle-check",
    detail: `${formatDeviceCount(failedCount)} could not be reached — apps that were reinstalled, wiped, or never allowed notifications. That is the normal shape of a broadcast.`,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Broadcast-specific recovery copy.
 *
 * The context matters more than the code. After a POST the operator's first
 * question is whether anything went out, so those messages say so plainly —
 * but the same 404 while merely reading the list must not claim "nothing was
 * sent", because nothing was being sent.
 */
export function broadcastErrorMessage(
  err: unknown,
  fallback: string,
  context: "read" | "send" = "send",
): string {
  if (!(isApiError(err) || err instanceof ApiError)) return fallback;

  if (context === "read") {
    switch (err.kind) {
      case "not_found":
        return "The broadcast service is not available on this API yet.";
      case "unauthorized":
        return "Your session expired. Sign in again as Super Admin.";
      case "forbidden":
        return "Broadcasts are restricted to Super Admin.";
      case "server":
        return "The broadcast service failed answering this. Try again in a moment.";
      default:
        return fallback;
    }
  }

  switch (err.kind) {
    case "not_found":
      return "The broadcast service is not available on this API yet. Nothing was sent.";
    case "unauthorized":
      return "Your session expired before this went out. Sign in again as Super Admin — nothing was sent.";
    case "forbidden":
      return "Sending a broadcast is restricted to Super Admin. Nothing was sent.";
    case "validation":
      return "The broadcast service refused this message. Check the audience, wording and link, then try again. Nothing was sent.";
    case "conflict":
      return "The broadcast service refused this message because something about it clashes with a recent send. Review recent sends, then try again. Nothing was sent.";
    case "server":
      return "The broadcast service failed while handling this. It may or may not have gone out — check recent sends before sending again.";
    default:
      return fallback;
  }
}
