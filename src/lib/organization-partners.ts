/**
 * Partner organizations and the member perk: words, checks and drafts for
 * GRIDGO's side (issue report F67EAE25; contract
 * `gridgo-api/docs/ORGANIZATION_MEMBERS_API.md`).
 *
 * The perk is off until a Super Admin sets it, and nothing here suggests an
 * amount. The amount is a ceiling: the perk only lowers GRIDGO's service fee,
 * so every sentence about it says "up to". The only figures worked with here
 * are the API's own, compared or drawn, never added up into new money.
 *
 * Pure: no React, no fetch.
 */

import { isApiError } from "@/lib/api/client";
import type {
  MemberPerk,
  MemberPerkInput,
  OrganizationPartner,
  PartnerBenefits,
  PartnerInput,
} from "@/lib/api/organization-partners";
import type { OrganizationAccount, OrganizationSummary } from "@/lib/api/types";
import { formatPhp, minorToPesosInput, pesosToMinor } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export const REASON_MAX = 2000;
export const LABEL_MAX = 40;
export const MAX_ORDERS_PER_TERM = 1000;
/** Share of the cap used before the page warns. A reading aid, not an API rule. */
export const NEAR_CAP_SHARE = 0.8;

export type Chip = { label: string; tone: StatusTone; icon: StatusIconName };

// ---- Dates -------------------------------------------------------------------

const MANILA_OFFSET_MS = 8 * 3_600_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
}

export function manilaDay(now: number = Date.now()): string {
  return new Date(now + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The last Manila day the perk still works on; a midnight end belongs to the day before. */
export function lastPerkDay(endsAt: string): string {
  return manilaDay(Date.parse(endsAt) - 1);
}

/** The end of a Manila day, as the instant the API takes. */
export function perkEndsAt(day: string): string {
  return new Date(Date.parse(`${day}T23:59:59.999Z`) - MANILA_OFFSET_MS).toISOString();
}

/** "31 May 2027"-style words for a calendar date. */
export function dayWords(day: string): string {
  if (!isDay(day)) return day;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

// ---- Partners ----------------------------------------------------------------

export function partnerChip(partner: Pick<OrganizationPartner, "status" | "live">): Chip {
  if (partner.status === "ended") return { label: "Ended", tone: "neutral", icon: "ban" };
  if (!partner.live) return { label: "On hold", tone: "warning", icon: "triangle-alert" };
  return { label: "Partner", tone: "success", icon: "circle-check" };
}

/** What a member sees as their label. */
export function memberLabel(label: string): string {
  return `${label.trim()} member`;
}

/** Members of an ended or on-hold partner get no perk whatever the settings say. */
export function perkReaches(
  partner: Pick<OrganizationPartner, "status" | "live">,
): boolean {
  return partner.status === "active" && partner.live;
}

/** The API's own rule for who may be a partner: an approved organization with an officer. */
export function canBePartner(
  organization: Pick<
    OrganizationAccount | OrganizationSummary,
    "currentOfficer" | "approvalCase"
  >,
): boolean {
  return Boolean(
    organization.currentOfficer &&
    organization.approvalCase &&
    ["approved", "pending", "rejected"].includes(organization.approvalCase.status),
  );
}

export const BENEFITS: readonly {
  key: keyof PartnerBenefits;
  label: string;
  help: string;
}[] = [
  {
    key: "badge",
    label: "Partner badge",
    help: "Shown on the organization and its members.",
  },
  { key: "jointPromos", label: "Joint promos", help: "Shared posts on GRIDGO's page." },
  { key: "boothSupport", label: "Booth support", help: "GRIDGO helps at their events." },
];

export type PartnerDraft = {
  label: string;
  partnerSince: string;
  benefits: PartnerBenefits;
};

export function partnerDraft(
  partner: OrganizationPartner | null,
  today: string,
): PartnerDraft {
  return partner
    ? {
        label: partner.label,
        partnerSince: partner.partnerSince,
        benefits: { ...partner.benefits },
      }
    : {
        label: "",
        partnerSince: today,
        benefits: { badge: false, jointPromos: false, boothSupport: false },
      };
}

export type PartnerProblems = Partial<Record<"label" | "partnerSince", string>>;

export function partnerProblems(draft: PartnerDraft, today: string): PartnerProblems {
  const problems: PartnerProblems = {};
  const label = draft.label.trim();
  if (!label) problems.label = "Write the short name members see.";
  else if (label.length > LABEL_MAX)
    problems.label = `Keep it to ${LABEL_MAX} characters.`;
  if (!isDay(draft.partnerSince))
    problems.partnerSince = "Pick the date the partnership started.";
  else if (draft.partnerSince > today)
    problems.partnerSince = "Pick today or an earlier date.";
  else if (draft.partnerSince < "1950-01-01") problems.partnerSince = "Check the year.";
  return problems;
}

export function partnerInput(
  draft: PartnerDraft,
  status: PartnerInput["status"],
): PartnerInput {
  return {
    label: draft.label.trim(),
    status,
    partnerSince: draft.partnerSince,
    benefits: { ...draft.benefits },
  };
}

export function partnerChanged(
  partner: OrganizationPartner,
  draft: PartnerDraft,
): boolean {
  return (
    partner.label !== draft.label.trim() ||
    partner.partnerSince !== draft.partnerSince ||
    BENEFITS.some(({ key }) => partner.benefits[key] !== draft.benefits[key])
  );
}

// ---- The perk in force ---------------------------------------------------------

export type PerkSource = "own" | "standard" | "none";

/** The setting an organization runs on: its own row replaces the standard completely. */
export function perkSetting(
  partner: Pick<OrganizationPartner, "perkOverride">,
  standard: MemberPerk | null,
): { source: PerkSource; setting: MemberPerk | null } {
  if (partner.perkOverride) return { source: "own", setting: partner.perkOverride };
  return standard
    ? { source: "standard", setting: standard }
    : { source: "none", setting: null };
}

export type PerkState = "unset" | "off" | "ended" | "on";

export function perkState(
  setting: MemberPerk | null,
  now: number = Date.now(),
): PerkState {
  if (!setting) return "unset";
  if (!setting.enabled) return "off";
  return Date.parse(setting.endsAt) > now ? "on" : "ended";
}

export const PERK_CHIP: Record<PerkState, Chip> = {
  unset: { label: "Off, not set yet", tone: "neutral", icon: "circle-dashed" },
  off: { label: "Off", tone: "neutral", icon: "ban" },
  ended: { label: "Past its end date", tone: "warning", icon: "clock" },
  on: { label: "On", tone: "success", icon: "circle-check" },
};

export function ordersWords(count: number): string {
  return count === 1 ? "1 order" : `${count.toLocaleString("en-PH")} orders`;
}

/** "Up to ₱X off an order": the fee can be smaller, so never a flat promise. */
export function perkAmountWords(amountMinor: number): string {
  return `Up to ${formatPhp(amountMinor)} off an order`;
}

export const PERK_CEILING_NOTE =
  "The perk comes out of GRIDGO's service fee. When an order's fee is smaller, the member saves the fee and no more.";

export const PERK_UNCHANGED_NOTE =
  "Print, delivery and pick-up prices, and what shops and riders earn, stay the same.";

export const NEW_ORDERS_NOTE =
  "New orders only. Orders already placed keep the perk they had.";

// ---- Budget ------------------------------------------------------------------

export type BudgetLevel = "unset" | "ok" | "near" | "spent";

export type Budget = {
  level: BudgetLevel;
  usedMinor: number;
  leftMinor: number | null;
  capMinor: number | null;
  /** Bar width only, 0 to 100. */
  percent: number;
};

/**
 * Where one organization's budget stands. `near` also covers a budget that no
 * longer fits one full perk: the API never cuts a perk down to fit, so such an
 * order would get none.
 */
export function partnerBudget(
  partner: OrganizationPartner,
  standard: MemberPerk | null,
): Budget {
  const { setting } = perkSetting(partner, standard);
  const usedMinor = partner.budgetUsedMinor;
  const leftMinor = partner.budgetLeftMinor;
  if (!setting || leftMinor === null) {
    return { level: "unset", usedMinor, leftMinor, capMinor: null, percent: 0 };
  }
  const capMinor = setting.budgetCapMinor;
  const share = capMinor > 0 ? usedMinor / capMinor : 1;
  const level: BudgetLevel =
    leftMinor <= 0
      ? "spent"
      : share >= NEAR_CAP_SHARE || leftMinor < setting.amountMinor
        ? "near"
        : "ok";
  return {
    level,
    usedMinor,
    leftMinor,
    capMinor,
    percent: Math.min(100, Math.max(0, share * 100)),
  };
}

export const BUDGET_CHIP: Record<Exclude<BudgetLevel, "unset" | "ok">, Chip> = {
  near: { label: "Near the cap", tone: "warning", icon: "triangle-alert" },
  spent: { label: "Budget used up", tone: "error", icon: "circle-x" },
};

/** True when a warning is worth acting on: the perk is on and reaches members. */
export function budgetNeedsAttention(
  partner: OrganizationPartner,
  standard: MemberPerk | null,
): boolean {
  const { level } = partnerBudget(partner, standard);
  return (
    perkReaches(partner) &&
    partner.perk !== null &&
    (level === "near" || level === "spent")
  );
}

/** What a near or spent budget means for members, in one sentence. */
export function budgetWarning(budget: Budget, setting: MemberPerk): string {
  if (budget.level === "spent") {
    return "The budget is used up, so members order without the perk until the cap is raised.";
  }
  if (budget.leftMinor !== null && budget.leftMinor < setting.amountMinor) {
    return `${formatPhp(budget.leftMinor)} is left, less than one full perk. A perk is never cut down to fit, so some orders will get none.`;
  }
  return `${formatPhp(budget.leftMinor ?? 0)} is left. When it runs out, members order without the perk.`;
}

/** Needs attention first, then live, then on hold, then ended; by label inside each. */
export function sortPartners(
  partners: readonly OrganizationPartner[],
  standard: MemberPerk | null,
): OrganizationPartner[] {
  const rank = (partner: OrganizationPartner) =>
    budgetNeedsAttention(partner, standard)
      ? 0
      : partner.status === "ended"
        ? 3
        : partner.live
          ? 2
          : 1;
  return [...partners].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label),
  );
}

// ---- The perk form -------------------------------------------------------------

export type PerkDraft = {
  enabled: boolean;
  amount: string;
  maxOrders: string;
  /** Last Manila day the perk works on. */
  lastDay: string;
  budgetCap: string;
};

/** Blank and off when nothing is set: the page never suggests an amount. */
export function perkDraft(setting: MemberPerk | null): PerkDraft {
  return setting
    ? {
        enabled: setting.enabled,
        amount: minorToPesosInput(setting.amountMinor),
        maxOrders: String(setting.maxOrdersPerTerm),
        lastDay: lastPerkDay(setting.endsAt),
        budgetCap: minorToPesosInput(setting.budgetCapMinor),
      }
    : { enabled: false, amount: "", maxOrders: "", lastDay: "", budgetCap: "" };
}

export type PerkProblems = Partial<
  Record<"amount" | "maxOrders" | "lastDay" | "budgetCap", string>
>;

/** The API's checks, said before it has to refuse (`400 invalid_member_perk`). */
export function readPerkDraft(
  draft: PerkDraft,
  setting: MemberPerk | null,
  now: number = Date.now(),
): { input: MemberPerkInput | null; problems: PerkProblems } {
  const problems: PerkProblems = {};
  const amountMinor = pesosToMinor(draft.amount);
  const budgetCapMinor = pesosToMinor(draft.budgetCap);
  const orders = /^\d+$/.test(draft.maxOrders.trim())
    ? Number(draft.maxOrders.trim())
    : 0;

  if (!draft.amount.trim()) problems.amount = "Enter the pesos off.";
  else if (amountMinor === null) problems.amount = "Pesos, up to two decimals.";
  else if (amountMinor < 1)
    problems.amount = "More than zero. To give nothing, turn the perk off.";

  if (!draft.maxOrders.trim()) problems.maxOrders = "Enter how many orders.";
  else if (orders < 1 || orders > MAX_ORDERS_PER_TERM) {
    problems.maxOrders = `A whole number from 1 to ${MAX_ORDERS_PER_TERM.toLocaleString("en-PH")}.`;
  }

  // An untouched date keeps the stored instant exactly.
  const endsAt =
    setting && draft.lastDay === lastPerkDay(setting.endsAt)
      ? setting.endsAt
      : isDay(draft.lastDay)
        ? perkEndsAt(draft.lastDay)
        : null;
  if (!endsAt) problems.lastDay = "Pick the last day.";
  else if (draft.enabled && Date.parse(endsAt) <= now) {
    problems.lastDay = "This day has passed. Pick a later one to turn the perk on.";
  }

  if (!draft.budgetCap.trim()) problems.budgetCap = "Enter the budget cap.";
  else if (budgetCapMinor === null) problems.budgetCap = "Pesos, up to two decimals.";
  else if (budgetCapMinor < 1) problems.budgetCap = "More than zero.";

  if (
    Object.keys(problems).length ||
    amountMinor === null ||
    budgetCapMinor === null ||
    !endsAt
  ) {
    return { input: null, problems };
  }
  return {
    input: {
      enabled: draft.enabled,
      amountMinor,
      maxOrdersPerTerm: orders,
      endsAt,
      budgetCapMinor,
    },
    problems,
  };
}

/** Each change in words, old value then new; every value when nothing was set. */
export function perkChanges(before: MemberPerk | null, after: MemberPerkInput): string[] {
  const lines: string[] = [];
  const add = (label: string, from: string | null, to: string) => {
    if (from === null) lines.push(`${label}: ${to}`);
    else if (from !== to) lines.push(`${label}: ${from} to ${to}`);
  };
  const onOff = (enabled: boolean) => (enabled ? "On" : "Off");
  add("Perk", before && onOff(before.enabled), onOff(after.enabled));
  add(
    "Pesos off an order, at most",
    before && formatPhp(before.amountMinor),
    formatPhp(after.amountMinor),
  );
  add(
    "Orders per member each term",
    before && String(before.maxOrdersPerTerm),
    String(after.maxOrdersPerTerm),
  );
  add(
    "Last day",
    before && dayWords(lastPerkDay(before.endsAt)),
    dayWords(lastPerkDay(after.endsAt)),
  );
  add(
    "Budget cap",
    before && formatPhp(before.budgetCapMinor),
    formatPhp(after.budgetCapMinor),
  );
  return lines;
}

/** Partners on this setting that already used as much as the new cap, so their perk stops. */
export function capAlreadyReached(
  capMinor: number,
  partners: readonly Pick<OrganizationPartner, "budgetUsedMinor" | "label">[],
): string[] {
  return partners.filter((p) => p.budgetUsedMinor >= capMinor).map((p) => p.label);
}

// ---- Errors --------------------------------------------------------------------

const ERROR_COPY: Record<string, string> = {
  verified_organization_required:
    "This organization is not verified, or has no officer of record, so it cannot be a partner yet. Nothing was changed.",
  organization_partner_stale:
    "Someone else changed this partnership a moment ago. The latest version is shown. Check it, then save again.",
  member_perk_stale:
    "Someone else changed this perk a moment ago. The latest version is now in force. Check your change against it, then save again.",
  member_perk_override_not_found: "This organization is already on the standard perk.",
  organization_partner_not_found: "This organization is not a partner.",
  invalid_partner_label: `Write a short name of up to ${LABEL_MAX} characters.`,
  invalid_partner_since: "Pick a real date that is not in the future.",
  invalid_partner_benefits:
    "The benefits could not be read. Reload, then tick them again.",
  invalid_member_perk:
    "One of the perk figures was refused. Check each one, then save again.",
  reason_required: `Write why, in up to ${REASON_MAX.toLocaleString("en-PH")} characters.`,
};

export function isStale(err: unknown): boolean {
  return (
    isApiError(err) &&
    (err.code === "organization_partner_stale" || err.code === "member_perk_stale")
  );
}

/** The API behind this portal does not have these routes yet. */
export function isNotAvailable(err: unknown): boolean {
  return (
    isApiError(err) && err.status === 404 && err.code !== "organization_partner_not_found"
  );
}

/** Plain recovery words. A lost connection never claims the change failed. */
export function partnerErrorText(err: unknown, when: "load" | "save"): string {
  if (isApiError(err)) {
    const copy = ERROR_COPY[err.code];
    if (copy) return copy;
    if (err.kind === "forbidden") {
      return when === "save"
        ? "Only Super Admin can change this. Nothing was changed."
        : "Your account cannot read partner organizations. Ask a Super Admin.";
    }
    if (err.kind === "unauthorized")
      return "Your sign-in ended. Sign in again, then retry.";
    if (when === "load") return "GRIDGO could not load this just now. Retry in a moment.";
    return err.kind === "server"
      ? "GRIDGO could not confirm the save. Reload to see whether it went through before trying again."
      : "The change was not saved. Check the fields, then try again.";
  }
  return when === "load"
    ? "You seem to be offline. Check your connection, then retry."
    : "The connection dropped, so we cannot tell whether it saved. Check your connection and reload before trying again.";
}
