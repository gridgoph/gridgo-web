/**
 * The launch promotions screen's rules: the Founding 30, the Friend Pass,
 * the budget cap and the ₱15 rewards (27 Oct sprint; data layer in
 * `src/lib/api/promotions.ts`).
 *
 * Amounts are typed in pesos and sent as centavos. Dates are typed in
 * Philippine time. Only fields whose typed value differs from what was read
 * are sent, so a save never moves something nobody touched. Every change
 * applies to new claims only: vouchers already claimed keep their value.
 *
 * Pure functions, unit tested in `src/lib/__tests__/promotions.test.ts`.
 */

import { isApiError } from "@/lib/api/client";
import {
  PromotionsShapeError,
  type AdminPromotions,
  type FoundingClaim,
  type FriendPassInvite,
  type PromotionSettings,
  type PromotionSettingsPatch,
} from "@/lib/api/promotions";
import { formatPhp, pesosToMinor } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { formatManila, isoToManilaLocal, manilaLocalToIso } from "@/lib/vouchers";

type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

/** Counts above this are a typing slip, and the API refuses them too. */
export const PROMOTION_COUNT_MAX = 1_000_000;

/** Above this many slots the strip of seats becomes a plain bar. */
export const SLOT_STRIP_MAX = 120;

export const NEW_CLAIMS_ONLY =
  "Applies to new claims only. Vouchers already claimed keep their value.";

// ---------------------------------------------------------------------------
// Money and counts
// ---------------------------------------------------------------------------

/** Centavos → what goes in a peso field: "200", or "200.50" when there are centavos. */
export function pesosInput(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = Math.abs(minor % 100);
  return cents ? `${whole}.${String(cents).padStart(2, "0")}` : String(whole);
}

export type Parsed = { value: number } | { problem: string };

/** A positive peso amount → centavos. Commas are allowed; a third decimal is not. */
export function parsePesos(input: string): Parsed {
  if (!input.trim()) return { problem: "Enter an amount in pesos." };
  const minor = pesosToMinor(input);
  if (minor === null) return { problem: "Enter pesos as a number, like 200 or 200.50." };
  if (minor <= 0) return { problem: "Enter an amount above ₱0." };
  return { value: minor };
}

/** A whole number of at least 1. */
export function parseCount(input: string): Parsed {
  const cleaned = input.trim().replace(/,/g, "");
  if (!cleaned) return { problem: "Enter a number." };
  if (!/^\d+$/.test(cleaned)) return { problem: "Enter a whole number, like 30." };
  const value = Number(cleaned);
  if (value < 1) return { problem: "Enter at least 1." };
  if (value > PROMOTION_COUNT_MAX) return { problem: "That is more than the service allows." };
  return { value };
}

/**
 * A Philippine-time `datetime-local` value → ISO instant. The field has whole
 * minutes, so a closing time typed as `…:59` means the end of that minute
 * (23:59 is 23:59:59), which is how the launch dates are stored.
 */
export function parseManilaTime(local: string, closing: boolean): Parsed & { iso?: string } {
  const iso = manilaLocalToIso(local);
  if (!iso) return { problem: "Enter a date and time." };
  const at = Date.parse(iso) + (closing && local.endsWith(":59") ? 59_000 : 0);
  return { value: at, iso: new Date(at).toISOString() };
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export type PromotionDraft = {
  foundingAmount: string;
  foundingSlots: string;
  foundingStarts: string;
  foundingEnds: string;
  foundingEnabled: boolean;
  friendAmount: string;
  friendPerFounder: string;
  friendTotal: string;
  friendUpgrade: string;
  friendEnabled: boolean;
  budgetCap: string;
  survey: string;
  mission: string;
  invite: string;
};

export type DraftField = keyof PromotionDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export function draftFromSettings(settings: PromotionSettings): PromotionDraft {
  return {
    foundingAmount: pesosInput(settings.founding.amountMinor),
    foundingSlots: String(settings.founding.slots),
    foundingStarts: isoToManilaLocal(settings.founding.startsAt),
    foundingEnds: isoToManilaLocal(settings.founding.endsAt),
    foundingEnabled: settings.founding.enabled,
    friendAmount: pesosInput(settings.friendPass.amountMinor),
    friendPerFounder: String(settings.friendPass.perFounder),
    friendTotal: String(settings.friendPass.total),
    friendUpgrade: isoToManilaLocal(settings.friendPass.upgradeAt),
    friendEnabled: settings.friendPass.enabled,
    budgetCap: pesosInput(settings.budgetCapMinor),
    survey: pesosInput(settings.rewards.surveyMinor),
    mission: pesosInput(settings.rewards.missionMinor),
    invite: pesosInput(settings.rewards.inviteMinor),
  };
}

const MONEY_FIELDS = [
  "foundingAmount",
  "friendAmount",
  "budgetCap",
  "survey",
  "mission",
  "invite",
] as const;
const COUNT_FIELDS = ["foundingSlots", "friendPerFounder", "friendTotal"] as const;

export type DraftCheck = { errors: DraftErrors; patch: PromotionSettingsPatch; changes: string[] };

/**
 * Checks the draft against the settings it was read from and builds the
 * PATCH: only fields whose typed value means something new, so a date shown
 * to the minute never rewrites stored seconds. `changes` lists each one in
 * words, for the save bar and the audit reason.
 */
export function checkDraft(draft: PromotionDraft, stored: PromotionSettings): DraftCheck {
  const errors: DraftErrors = {};
  const base = draftFromSettings(stored);
  const money: Partial<Record<(typeof MONEY_FIELDS)[number], number>> = {};
  const counts: Partial<Record<(typeof COUNT_FIELDS)[number], number>> = {};

  for (const field of MONEY_FIELDS) {
    const parsed = parsePesos(draft[field]);
    if ("problem" in parsed) errors[field] = parsed.problem;
    else money[field] = parsed.value;
  }
  for (const field of COUNT_FIELDS) {
    const parsed = parseCount(draft[field]);
    if ("problem" in parsed) errors[field] = parsed.problem;
    else counts[field] = parsed.value;
  }

  // A date nobody touched keeps its stored instant to the second.
  const time = (field: "foundingStarts" | "foundingEnds" | "friendUpgrade", storedIso: string, closing: boolean) => {
    if (draft[field] === base[field] && Number.isFinite(Date.parse(storedIso)))
      return { at: Date.parse(storedIso), iso: storedIso, changed: false };
    const parsed = parseManilaTime(draft[field], closing);
    if ("problem" in parsed) {
      errors[field] = parsed.problem;
      return null;
    }
    return { at: parsed.value, iso: parsed.iso!, changed: true };
  };
  const starts = time("foundingStarts", stored.founding.startsAt, false);
  const ends = time("foundingEnds", stored.founding.endsAt, true);
  const upgrade = time("friendUpgrade", stored.friendPass.upgradeAt, true);
  if (starts && ends && ends.at <= starts.at) errors.foundingEnds = "End after the start.";
  if (starts && ends && upgrade && !errors.foundingEnds) {
    if (upgrade.at < starts.at) errors.friendUpgrade = "Upgrade on or after the Founding start.";
    else if (upgrade.at >= ends.at) errors.friendUpgrade = "Upgrade before the Founding end.";
  }

  const patch: PromotionSettingsPatch = {};
  const changes: string[] = [];
  const peso = (minor: number) => formatPhp(minor);
  const when = (iso: string) => formatManila(iso);

  function set<S extends "founding" | "friendPass" | "rewards">(
    section: S,
    key: string,
    value: unknown,
  ) {
    const target = (patch[section] ??= {}) as Record<string, unknown>;
    target[key] = value;
  }

  const moneyRows: [
    (typeof MONEY_FIELDS)[number],
    number,
    string,
    (value: number) => void,
  ][] = [
    ["foundingAmount", stored.founding.amountMinor, "Founding amount", (v) => set("founding", "amountMinor", v)],
    ["friendAmount", stored.friendPass.amountMinor, "Friend Pass amount", (v) => set("friendPass", "amountMinor", v)],
    ["budgetCap", stored.budgetCapMinor, "Budget cap", (v) => (patch.budgetCapMinor = v)],
    ["survey", stored.rewards.surveyMinor, "Survey reward", (v) => set("rewards", "surveyMinor", v)],
    ["mission", stored.rewards.missionMinor, "Mission reward", (v) => set("rewards", "missionMinor", v)],
    ["invite", stored.rewards.inviteMinor, "Invite reward", (v) => set("rewards", "inviteMinor", v)],
  ];
  for (const [field, was, label, apply] of moneyRows) {
    const next = money[field];
    if (next === undefined || next === was) continue;
    apply(next);
    changes.push(`${label} ${peso(was)} to ${peso(next)}`);
  }

  const countRows: [(typeof COUNT_FIELDS)[number], number, string, (value: number) => void][] = [
    ["foundingSlots", stored.founding.slots, "Founding slots", (v) => set("founding", "slots", v)],
    ["friendPerFounder", stored.friendPass.perFounder, "Friends per Founder", (v) => set("friendPass", "perFounder", v)],
    ["friendTotal", stored.friendPass.total, "Friend Pass total", (v) => set("friendPass", "total", v)],
  ];
  for (const [field, was, label, apply] of countRows) {
    const next = counts[field];
    if (next === undefined || next === was) continue;
    apply(next);
    changes.push(`${label} ${was} to ${next}`);
  }

  const timeRows: [typeof starts, string, string, () => void][] = [
    [starts, stored.founding.startsAt, "Founding start", () => set("founding", "startsAt", starts!.iso)],
    [ends, stored.founding.endsAt, "Founding end", () => set("founding", "endsAt", ends!.iso)],
    [upgrade, stored.friendPass.upgradeAt, "Friend Pass upgrade", () => set("friendPass", "upgradeAt", upgrade!.iso)],
  ];
  for (const [parsed, was, label, apply] of timeRows) {
    if (!parsed?.changed || parsed.at === Date.parse(was)) continue;
    apply();
    changes.push(`${label} ${when(was)} to ${when(parsed.iso)}`);
  }

  if (draft.foundingEnabled !== stored.founding.enabled) {
    set("founding", "enabled", draft.foundingEnabled);
    changes.push(draft.foundingEnabled ? "Founding 30 turned on" : "Founding 30 turned off");
  }
  if (draft.friendEnabled !== stored.friendPass.enabled) {
    set("friendPass", "enabled", draft.friendEnabled);
    changes.push(draft.friendEnabled ? "Friend Pass turned on" : "Friend Pass turned off");
  }

  return { errors, patch, changes };
}

export function auditReason(changes: string[]): string {
  return `Launch promotions: ${changes.join("; ")}`;
}

// ---------------------------------------------------------------------------
// Where each promotion stands
// ---------------------------------------------------------------------------

export type PromotionState = "off" | "not_started" | "open" | "sold_out" | "cap_reached" | "ended";

/** Below the smallest live voucher, nothing more can be given. */
export function capReached(data: AdminPromotions): boolean {
  const { founding, friendPass } = data.settings;
  const amounts = [
    founding.enabled ? founding.amountMinor : null,
    friendPass.enabled ? friendPass.amountMinor : null,
  ].filter((value): value is number => value !== null);
  if (!amounts.length) return false;
  return data.budget.remainingMinor < Math.min(...amounts);
}

export function foundingState(data: AdminPromotions, now: number): PromotionState {
  const { founding } = data.settings;
  if (!founding.enabled) return "off";
  if (now < Date.parse(founding.startsAt)) return "not_started";
  if (now > Date.parse(founding.endsAt)) return "ended";
  if (data.founding.available <= 0) return "sold_out";
  if (data.budget.remainingMinor < founding.amountMinor) return "cap_reached";
  return "open";
}

export function friendPassState(data: AdminPromotions, now: number): PromotionState {
  const { friendPass, founding } = data.settings;
  if (!friendPass.enabled) return "off";
  if (now < Date.parse(founding.startsAt)) return "not_started";
  if (now > Date.parse(founding.endsAt)) return "ended";
  if (data.friendPass.issued >= data.friendPass.total) return "sold_out";
  if (data.budget.remainingMinor < friendPass.amountMinor) return "cap_reached";
  return "open";
}

export function presentPromotionState(state: PromotionState, soldOut = "All slots taken"): Presentation {
  switch (state) {
    case "off":
      return { label: "Turned off", tone: "neutral", icon: "ban" };
    case "not_started":
      return { label: "Not started", tone: "neutral", icon: "clock" };
    case "open":
      return { label: "Open to claim", tone: "success", icon: "circle-check" };
    case "sold_out":
      return { label: soldOut, tone: "warning", icon: "circle-dot" };
    case "cap_reached":
      return { label: "Budget cap reached", tone: "error", icon: "triangle-alert" };
    case "ended":
      return { label: "Ended", tone: "neutral", icon: "ban" };
  }
}

export type Seat = "used" | "claimed" | "open";

/**
 * One seat per Founding slot, in the order a reader counts them: used first,
 * then claimed and waiting, then open. Expired unused claims gave their seat
 * back, so they are open seats. When slots were lowered below what is
 * already claimed, every claim still gets a seat.
 */
export function foundingSeats(founding: AdminPromotions["founding"]): Seat[] {
  const used = Math.max(0, founding.used);
  const waiting = Math.max(0, founding.claimed - used);
  const open = Math.max(0, founding.slots - used - waiting);
  return [
    ...Array<Seat>(used).fill("used"),
    ...Array<Seat>(waiting).fill("claimed"),
    ...Array<Seat>(open).fill("open"),
  ];
}

export type BudgetBar = {
  /** Shares of the cap, 0–100, for the bar's two segments. */
  redeemedPercent: number;
  committedPercent: number;
  /** Committed went past the cap (it was lowered under live vouchers). */
  over: boolean;
};

export function budgetBar(budget: AdminPromotions["budget"]): BudgetBar {
  if (budget.capMinor <= 0)
    return { redeemedPercent: 0, committedPercent: 0, over: budget.committedMinor > 0 };
  const share = (minor: number) => Math.min(100, Math.max(0, (minor / budget.capMinor) * 100));
  return {
    redeemedPercent: share(budget.redeemedMinor),
    committedPercent: share(budget.committedMinor),
    over: budget.committedMinor > budget.capMinor,
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export function presentClaimStatus(status: string): Presentation {
  switch (status) {
    case "available":
      return { label: "Not used yet", tone: "info", icon: "circle-dot" };
    case "reserved":
      return { label: "On a checkout", tone: "warning", icon: "clock" };
    case "used":
      return { label: "Used", tone: "success", icon: "circle-check" };
    case "expired":
      return { label: "Expired unused", tone: "neutral", icon: "clock" };
    case "void":
      return { label: "Voided", tone: "error", icon: "ban" };
    default:
      return { label: "Unknown", tone: "neutral", icon: "circle-help" };
  }
}

export function presentInviteStatus(status: string): Presentation {
  switch (status) {
    case "invited":
      return { label: "Waiting for friend", tone: "neutral", icon: "clock" };
    case "claimed":
      return { label: "Claimed, not used", tone: "info", icon: "circle-dot" };
    case "used":
      return { label: "Used", tone: "success", icon: "circle-check" };
    case "expired":
      return { label: "Expired", tone: "neutral", icon: "clock" };
    case "void":
      return { label: "Voided", tone: "error", icon: "ban" };
    case "skipped_already_founder":
      return { label: "Friend is a Founder", tone: "neutral", icon: "award" };
    default:
      return { label: "Unknown", tone: "neutral", icon: "circle-help" };
  }
}

export function personText(name: string | null, email: string | null): string {
  return name || email || "Unnamed account";
}

/** Case-insensitive match on any of the given fields. */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

export function claimMatches(claim: FoundingClaim, query: string): boolean {
  return matchesSearch(query, [claim.name, claim.email]);
}

export function inviteMatches(invite: FriendPassInvite, query: string): boolean {
  return matchesSearch(query, [invite.founder.name, invite.founder.email, invite.friendEmail]);
}

/** Newest first; a claim without a time sorts last. */
export function byNewest<T>(rows: T[], at: (row: T) => string | null): T[] {
  return [...rows].sort((a, b) => (Date.parse(at(b) ?? "") || 0) - (Date.parse(at(a) ?? "") || 0));
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CLAIMS_CSV_HEADER = [
  "Name",
  "Email",
  "Claimed (Manila)",
  "Value (PHP)",
  "Status",
  "Orders",
  "Came from a Friend Pass upgrade",
] as const;

/** Names and emails are typed by clients: a cell that would open as a formula is text. */
function cell(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function claimsCsv(claims: FoundingClaim[]): string {
  const rows = claims.map((claim) =>
    [
      claim.name,
      claim.email,
      claim.claimedAt ? formatManila(claim.claimedAt) : "",
      (claim.valueMinor / 100).toFixed(2),
      presentClaimStatus(claim.status).label,
      claim.orderIds.join(" "),
      claim.viaFriendPass ? "Yes" : "No",
    ]
      .map(cell)
      .join(","),
  );
  return [CLAIMS_CSV_HEADER.map(cell).join(","), ...rows].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Someone else saved since this screen read the settings. */
export function isVersionConflict(err: unknown): boolean {
  return isApiError(err) && err.status === 409 && err.code.endsWith("version_conflict");
}

export const CONFLICT_COPY =
  "Someone else changed these promotions since you opened them. Reload to see their changes, then make yours again.";

export function promotionsErrorText(err: unknown, fallback: string): string {
  if (err instanceof PromotionsShapeError)
    return "The service answered in a shape this screen does not read yet. Try again after the next update.";
  if (isVersionConflict(err)) return CONFLICT_COPY;
  if (isApiError(err)) {
    if (err.code === "invalid_promotion_settings")
      return "The service refused these values. Check the amounts, counts and dates, then save again.";
    if (err.status === 403) return "Only Super Admin can change promotions.";
    if (err.status === 404) return "Promotions are not available on this service yet.";
    if (err.kind === "unauthorized") return "Your session expired. Sign in again to carry on.";
    if (err.kind === "server") return "The service had a problem. Try again in a moment.";
    return fallback;
  }
  return "Could not reach the service. Check your connection, then try again.";
}
