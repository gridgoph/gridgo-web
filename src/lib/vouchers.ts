/**
 * GRIDGO-funded vouchers (gridgo-api#204, contract `gridgo-api/docs/VOUCHERS_API.md`).
 *
 * Super Admin runs campaigns (a value, a mode, how long each voucher lasts and
 * how many accounts may get one), issues an assigned campaign to a list of
 * addresses, reads the activity log and its budget, and voids or reissues one
 * voucher with a reason. Operations only looks up a client's wallet.
 *
 * A voucher is GRIDGO's money: it comes off GRIDGO's service fee first, then
 * delivery, never the shop price; payout stages and rider pay never move.
 * Only one discount applies to an order, the voucher or the organization
 * discount, whichever saves more.
 *
 * Pure functions, unit tested in `src/lib/__tests__/vouchers.test.ts`.
 */

import { isApiError } from "@/lib/api/client";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import type {
  Order as ApiOrder,
  Voucher,
  VoucherCampaign,
  VoucherCampaignMode,
  VoucherCampaignStatus,
  VoucherIssueRecipient,
  VoucherIssueReport,
  VoucherLedgerKind,
} from "@/lib/api/types";

/** API bounds, so the form can say no before the server does. */
export const VOUCHER_LIMITS = {
  nameMax: 120,
  reasonMax: 1000,
  recipientsMax: 1000,
  totalLimitMax: 1_000_000,
  validityDaysMax: 365,
  csvMaxBytes: 1024 * 1024,
} as const;

/** 4–40 letters, digits or hyphens, after trimming and upper-casing. */
export const VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{4,40}$/;

/** The report's own first campaign: ₱15, issued by GRIDGO, seven days. */
export const TESTER_PRESET = {
  name: "Soft-launch tester thanks",
  valueMinor: 1500,
  mode: "assigned" as VoucherCampaignMode,
  validityDays: 7,
  totalLimit: 100,
};

const MANILA = "Asia/Manila";

type Presentation = { label: string; tone: StatusTone; icon: StatusIconName };

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function presentCampaignStatus(status: VoucherCampaignStatus): Presentation {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral", icon: "square-pen" };
    case "active":
      return { label: "Active", tone: "success", icon: "circle-check" };
    case "paused":
      return { label: "Paused", tone: "warning", icon: "clock" };
    case "ended":
      return { label: "Ended", tone: "neutral", icon: "ban" };
  }
}

export type CampaignMove = {
  to: Exclude<VoucherCampaignStatus, "draft">;
  /** The button. */
  label: string;
  /** What the move does, in the confirmation. */
  effect: string;
  /** Ending is final, so it is confirmed and never the primary action. */
  final: boolean;
};

/** The moves the API allows from a status, primary first. */
export function campaignMoves(status: VoucherCampaignStatus): CampaignMove[] {
  const end: CampaignMove = {
    to: "ended",
    label: "End campaign",
    effect:
      "No one can be issued this voucher again, and vouchers already issued stop working at checkout. A checkout that already holds one keeps it. Ending cannot be undone; to run the offer again, create a new campaign.",
    final: true,
  };
  switch (status) {
    case "draft":
      return [
        {
          to: "active",
          label: "Launch campaign",
          effect:
            "Its terms lock: value, code, validity and limits can no longer change. You can then issue it.",
          final: false,
        },
        end,
      ];
    case "active":
      return [
        {
          to: "paused",
          label: "Pause",
          effect:
            "Nothing new is issued and clients cannot use these vouchers at checkout until you resume. A checkout that already holds one keeps it. Expiry dates do not stop.",
          final: false,
        },
        end,
      ];
    case "paused":
      return [
        {
          to: "active",
          label: "Resume",
          effect: "Issuing and checkout use start again. Vouchers that expired meanwhile stay expired.",
          final: false,
        },
        end,
      ];
    case "ended":
      return [];
  }
}

/** Terms change only while the campaign is a draft nobody holds yet. */
export function campaignEditable(campaign: VoucherCampaign, issuedCount: number | null): boolean {
  return campaign.status === "draft" && issuedCount === 0;
}

export const MODE_COPY: Record<VoucherCampaignMode, { label: string; body: string }> = {
  assigned: {
    label: "Issued by GRIDGO",
    body: "You issue it to a list of client email addresses. Clients cannot add it with a code.",
  },
  shared: {
    label: "Shared code",
    body: "Clients add it themselves by typing the code in the app. You never issue it to a list.",
  },
};

/** "7 days from issue" or "Until 20 Oct 2026, 5:00 PM". */
export function validityText(campaign: Pick<VoucherCampaign, "endsAt" | "validityDays">): string {
  if (campaign.endsAt) return `Until ${formatManila(campaign.endsAt)}`;
  const days = campaign.validityDays ?? 7;
  return `${days} ${days === 1 ? "day" : "days"} from issue`;
}

/** Why a campaign cannot be issued right now, or null when it can. */
export function issueBlocker(campaign: VoucherCampaign, now: number = Date.now()): string | null {
  if (campaign.mode === "shared")
    return "A shared-code campaign is never issued to a list. Clients add it by typing the code in the app.";
  if (campaign.status === "draft") return "Launch the campaign before issuing it.";
  if (campaign.status === "paused") return "The campaign is paused. Resume it to issue more.";
  if (campaign.status === "ended") return "The campaign has ended. Create a new campaign to issue more.";
  if (campaign.endsAt && Date.parse(campaign.endsAt) <= now)
    return "The campaign's end date has passed. Create a new campaign to issue more.";
  return null;
}

// ---------------------------------------------------------------------------
// The campaign form
// ---------------------------------------------------------------------------

export type CampaignDraft = {
  name: string;
  /** Pesos as typed. */
  value: string;
  mode: VoucherCampaignMode;
  /** Blank asks the API to generate one. */
  code: string;
  validity: "days" | "date";
  days: string;
  /** `YYYY-MM-DDTHH:mm`, Philippine time. */
  endsAt: string;
  totalLimit: string;
};

export type CampaignDraftErrors = Partial<Record<keyof CampaignDraft, string>>;

export const EMPTY_CAMPAIGN_DRAFT: CampaignDraft = {
  name: "",
  value: "",
  mode: "assigned",
  code: "",
  validity: "days",
  days: "7",
  endsAt: "",
  totalLimit: "",
};

export function testerDraft(): CampaignDraft {
  return {
    ...EMPTY_CAMPAIGN_DRAFT,
    name: TESTER_PRESET.name,
    value: (TESTER_PRESET.valueMinor / 100).toFixed(2),
    mode: TESTER_PRESET.mode,
    days: String(TESTER_PRESET.validityDays),
    totalLimit: String(TESTER_PRESET.totalLimit),
  };
}

export function draftFromCampaign(campaign: VoucherCampaign): CampaignDraft {
  return {
    name: campaign.name,
    value: (campaign.valueMinor / 100).toFixed(2),
    mode: campaign.mode,
    code: campaign.mode === "shared" ? campaign.code : "",
    validity: campaign.endsAt ? "date" : "days",
    days: String(campaign.validityDays ?? 7),
    endsAt: campaign.endsAt ? isoToManilaLocal(campaign.endsAt) : "",
    totalLimit: String(campaign.totalLimit),
  };
}

function pesos(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

function wholeNumber(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

/** Field-by-field problems in the words printed under each field. */
export function validateCampaignDraft(
  draft: CampaignDraft,
  now: number = Date.now(),
): CampaignDraftErrors {
  const errors: CampaignDraftErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Name the campaign. Clients see this name in their wallet.";
  else if (name.length > VOUCHER_LIMITS.nameMax)
    errors.name = `Keep the name to ${VOUCHER_LIMITS.nameMax} characters.`;
  const value = pesos(draft.value);
  if (value === null || value <= 0) errors.value = "Enter the voucher's value in pesos, for example 15.00.";
  if (draft.mode === "shared") {
    const code = normalizeCode(draft.code);
    if (code && !VOUCHER_CODE_PATTERN.test(code))
      errors.code = "Use 4 to 40 letters, numbers or hyphens.";
  }
  if (draft.validity === "days") {
    const days = wholeNumber(draft.days);
    if (days === null || days < 1 || days > VOUCHER_LIMITS.validityDaysMax)
      errors.days = `Enter 1 to ${VOUCHER_LIMITS.validityDaysMax} days.`;
  } else {
    const iso = manilaLocalToIso(draft.endsAt);
    if (!iso) errors.endsAt = "Pick the date and time the campaign ends.";
    else if (Date.parse(iso) <= now) errors.endsAt = "Pick a time that is still ahead.";
  }
  const limit = wholeNumber(draft.totalLimit);
  if (limit === null || limit < 1 || limit > VOUCHER_LIMITS.totalLimitMax)
    errors.totalLimit = `Enter how many accounts can get one, 1 to ${VOUCHER_LIMITS.totalLimitMax.toLocaleString("en-PH")}.`;
  return errors;
}

/** The API body. Call only after `validateCampaignDraft` is empty. */
export function inputFromDraft(draft: CampaignDraft) {
  const code = draft.mode === "shared" ? normalizeCode(draft.code) : "";
  return {
    name: draft.name.trim(),
    valueMinor: pesos(draft.value) ?? 0,
    mode: draft.mode,
    ...(code ? { code } : {}),
    ...(draft.validity === "days"
      ? { validityDays: wholeNumber(draft.days) ?? 7, endsAt: null }
      : { endsAt: manilaLocalToIso(draft.endsAt), validityDays: null }),
    totalLimit: wholeNumber(draft.totalLimit) ?? 0,
    perAccountLimit: 1 as const,
  };
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** The most a campaign can cost if every voucher is used in full. */
export function campaignCeilingMinor(valueMinor: number, totalLimit: number): number {
  return valueMinor * totalLimit;
}

// ---------------------------------------------------------------------------
// Time, in Philippine time (UTC+8, no daylight saving)
// ---------------------------------------------------------------------------

export function formatManila(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MANILA,
  }).format(at);
}

/** `2026-10-20T17:00` (Manila) → ISO instant, or null when incomplete. */
export function manilaLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const at = Date.parse(`${local}:00+08:00`);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

export function isoToManilaLocal(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  return new Date(at + 8 * 3600_000).toISOString().slice(0, 16);
}

/** Inclusive Manila day bounds for the activity log's date filter. */
export function manilaDayStart(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return new Date(Date.parse(`${day}T00:00:00.000+08:00`)).toISOString();
}

export function manilaDayEnd(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return new Date(Date.parse(`${day}T23:59:59.999+08:00`)).toISOString();
}

export type Countdown = {
  text: string;
  /** Amber under 48 hours, red under 24, as the client wallet shows it. */
  urgency: "calm" | "soon" | "urgent" | "over";
};

/** Time left before `expiresAt`, measured on the server's clock when given. */
export function countdown(expiresAt: string, now: number): Countdown {
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left) || left <= 0) return { text: "Expired", urgency: "over" };
  const minutes = Math.floor(left / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const text =
    days >= 1
      ? `${days} ${days === 1 ? "day" : "days"}${hours % 24 ? ` ${hours % 24} h` : ""} left`
      : hours >= 1
        ? `${hours} h ${minutes % 60} min left`
        : `${Math.max(1, minutes)} min left`;
  return { text, urgency: hours < 24 ? "urgent" : hours < 48 ? "soon" : "calm" };
}

// ---------------------------------------------------------------------------
// Wallet items
// ---------------------------------------------------------------------------

export function presentVoucherStatus(voucher: Voucher): Presentation & { hint?: string } {
  switch (voucher.status) {
    case "available":
      if (voucher.reservation)
        return {
          label: "Held at checkout",
          tone: "info",
          icon: "circle-dot",
          hint: `Held for a checkout until ${formatManila(voucher.reservation.expiresAt)}.`,
        };
      if (!voucher.redeemable)
        return {
          label: "Not usable now",
          tone: "warning",
          icon: "triangle-alert",
          hint: "Its campaign is paused or has ended.",
        };
      return { label: "Available", tone: "success", icon: "circle-check" };
    case "used":
      return { label: "Used", tone: "neutral", icon: "circle-check" };
    case "expired":
      return { label: "Expired", tone: "neutral", icon: "clock" };
    case "void":
      return { label: "Voided", tone: "error", icon: "ban" };
  }
}

export function canVoid(voucher: Voucher): boolean {
  return voucher.status === "available";
}

export function canReissue(voucher: Voucher, now: number): boolean {
  return voucher.status === "void" && Date.parse(voucher.expiresAt) > now;
}

export type WalletTab = "all" | "available" | "used" | "expired";

/** The client's own tabs: Expired also holds voided vouchers. */
export function inWalletTab(voucher: Voucher, tab: WalletTab): boolean {
  if (tab === "all") return true;
  if (tab === "expired") return voucher.status === "expired" || voucher.status === "void";
  return voucher.status === tab;
}

// ---------------------------------------------------------------------------
// The activity log
// ---------------------------------------------------------------------------

export const LEDGER_KINDS: { kind: VoucherLedgerKind; label: string }[] = [
  { kind: "issued", label: "Issued" },
  { kind: "reserved", label: "Held at checkout" },
  { kind: "released", label: "Hold released" },
  { kind: "redeemed", label: "Used on an order" },
  { kind: "restored", label: "Given back" },
  { kind: "no_fault", label: "Refund, not the client's fault" },
  { kind: "client_fault", label: "Refund or cancel, client's fault" },
  { kind: "void", label: "Voided" },
  { kind: "reissue", label: "Reissued" },
];

export function ledgerKindLabel(kind: string): string {
  return LEDGER_KINDS.find((row) => row.kind === kind)?.label ?? kind.replace(/_/g, " ");
}

/** Only these two move budget: a redemption spends it, a restore returns it. */
export function ledgerMovesBudget(kind: string): boolean {
  return kind === "redeemed" || kind === "restored";
}

/** The orders a log row names, in the order the API lists them. */
export function ledgerOrderIds(data: { orderId?: unknown; orderIds?: unknown }): string[] {
  const ids = Array.isArray(data.orderIds) ? data.orderIds.filter((id) => typeof id === "string") : [];
  if (typeof data.orderId === "string" && !ids.includes(data.orderId)) ids.unshift(data.orderId);
  return ids as string[];
}

/**
 * Pesos from a decimal integer string of centavos. The budget total is a
 * string because the sum can pass JavaScript's safe-integer range.
 */
export function formatMinorString(minor: string): string {
  if (!/^-?\d+$/.test(minor.trim())) return "—";
  // String arithmetic, so no amount is ever rounded through a float.
  const digits = minor.trim().replace(/^-/, "").replace(/^0+(?=\d)/, "").padStart(3, "0");
  const negative = minor.trim().startsWith("-") && /[1-9]/.test(digits);
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = digits.slice(-2);
  return `${negative ? "−" : ""}₱${whole}.${cents}`;
}

export function minorStringIsNegative(minor: string): boolean {
  return /^\s*-\d*[1-9]/.test(minor);
}

// ---------------------------------------------------------------------------
// Issuing to a list
// ---------------------------------------------------------------------------

export type ParsedRecipients = {
  recipients: VoucherIssueRecipient[];
  /** True when a CSV said, row by row, who is an adult. */
  adultColumn: boolean;
  /** Addresses that appeared more than once, counted once. */
  repeats: number;
  /** Bits of a pasted list that are not addresses ("Email", a name). */
  ignored: string[];
  /** A CSV the API would refuse, in words; nothing is sent. */
  problem: string | null;
};

const EMPTY_PARSE: ParsedRecipients = {
  recipients: [],
  adultColumn: false,
  repeats: 0,
  ignored: [],
  problem: null,
};

/**
 * A pasted list or an uploaded file, read the way the API reads it. A file
 * whose first row is `email` (optionally `email,adultConfirmed`) is a CSV
 * with the API's rules; anything else is a loose list of addresses separated
 * by lines, commas, semicolons or spaces ("Name <address>" keeps the address).
 */
export function parseRecipients(text: string): ParsedRecipients {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return EMPTY_PARSE;
  const firstLine = trimmed.split(/\r?\n/, 1)[0].trim().toLowerCase();
  if (/^"?email"?\s*(,|$)/.test(firstLine)) {
    const csv = parseCsv(trimmed);
    // A pasted spreadsheet column headed "Email" is a list, not a strict CSV:
    // only a file that names the adult column must follow the API's rules.
    if (!csv.problem || /adultconfirmed/.test(firstLine)) return csv;
  }
  const ignored: string[] = [];
  const found: string[] = [];
  for (const token of trimmed.split(/[\s,;]+/)) {
    if (!token) continue;
    const bracketed = /<([^<>\s]+@[^<>\s]+)>/.exec(token);
    const candidate = (bracketed ? bracketed[1] : token).replace(/^["'(<]+|["')>.]+$/g, "");
    if (candidate.includes("@")) found.push(candidate);
    else ignored.push(token);
  }
  return dedupe(
    found.map((email) => ({ email, adultConfirmed: false })),
    false,
    ignored,
  );
}

function dedupe(
  rows: VoucherIssueRecipient[],
  adultColumn: boolean,
  ignored: string[] = [],
): ParsedRecipients {
  const seen = new Map<string, VoucherIssueRecipient>();
  let repeats = 0;
  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      repeats++;
      continue;
    }
    seen.set(key, { email: key, adultConfirmed: row.adultConfirmed });
  }
  return { recipients: [...seen.values()], adultColumn, repeats, ignored, problem: null };
}

/** The API's CSV reader (RFC 4180 quoting), so the count shown is the count sent. */
function parseCsv(text: string): ParsedRecipients {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i] ?? "\n";
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closed = true;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && !cell && !closed) {
      quoted = true;
      continue;
    }
    if (closed && ![",", "\r", "\n"].includes(ch))
      return { ...EMPTY_PARSE, problem: `Row ${rows.length + 1} has text after a closing quote.` };
    if (ch === "," || ch === "\n") {
      row.push(cell.trim());
      cell = "";
      closed = false;
      if (ch === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (ch !== "\r") cell += ch;
  }
  if (quoted) return { ...EMPTY_PARSE, problem: "A quote is never closed. Check the file in a spreadsheet." };
  const header = rows.shift()?.map((c) => c.toLowerCase()) ?? [];
  if (
    header[0] !== "email" ||
    header.length > 2 ||
    (header.length === 2 && header[1] !== "adultconfirmed")
  )
    return {
      ...EMPTY_PARSE,
      problem: "The first row must be email, or email,adultConfirmed. No other columns.",
    };
  const out: VoucherIssueRecipient[] = [];
  for (const [index, cells] of rows.entries()) {
    if (cells.length > header.length)
      return { ...EMPTY_PARSE, problem: `Row ${index + 2} has more columns than the header.` };
    const flag = cells[1]?.toLowerCase();
    if (flag && flag !== "true" && flag !== "false")
      return { ...EMPTY_PARSE, problem: `Row ${index + 2}: adultConfirmed must be true or false.` };
    out.push({ email: cells[0] ?? "", adultConfirmed: flag === "true" });
  }
  return dedupe(out, header.length === 2);
}

/** What to send: the CSV's own column wins; otherwise the one attestation. */
export function recipientsToSend(
  parsed: ParsedRecipients,
  allAdults: boolean,
): VoucherIssueRecipient[] {
  if (parsed.adultColumn) return parsed.recipients;
  return parsed.recipients.map((row) => ({ ...row, adultConfirmed: allAdults }));
}

export type IssueSummary = {
  issued: number;
  alreadyHad: number;
  unmatched: number;
  byReason: Record<VoucherIssueReport["unmatched"][number]["reason"], string[]>;
};

export function summarizeIssue(report: VoucherIssueReport): IssueSummary {
  const byReason: IssueSummary["byReason"] = {
    no_client_account: [],
    invalid_email: [],
    ambiguous_email: [],
  };
  for (const row of report.unmatched) (byReason[row.reason] ??= []).push(row.email);
  return {
    issued: report.matched.filter((row) => row.issued).length,
    alreadyHad: report.matched.filter((row) => !row.issued).length,
    unmatched: report.unmatched.length,
    byReason,
  };
}

export const UNMATCHED_COPY: Record<keyof IssueSummary["byReason"], { title: string; body: string }> = {
  no_client_account: {
    title: "No client account",
    body: "Nobody signed up with these addresses. Ask them to make an account in the app with this email, then issue again.",
  },
  ambiguous_email: {
    title: "More than one account",
    body: "Each of these addresses belongs to more than one client account, so no voucher was issued. Sort out the accounts first.",
  },
  invalid_email: {
    title: "Not an email address",
    body: "Check these for typos.",
  },
};

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type OrderVoucherMoney = {
  amountMinor: number;
  /** Taken off GRIDGO's service fee. */
  serviceFeeMinor: number;
  /** Taken off delivery once the fee is used up. */
  deliveryMinor: number;
};

/** The voucher on an order, or null. Never on a shop or rider projection. */
export function orderVoucher(
  order: Pick<
    ApiOrder,
    "voucher" | "voucherFunding" | "voucherDiscountMinor" | "voucherServiceFeeMinor" | "voucherDeliveryMinor"
  >,
): OrderVoucherMoney | null {
  const line = order.voucher ?? order.voucherFunding ?? null;
  const amountMinor = order.voucherDiscountMinor ?? line?.amountMinor ?? 0;
  if (!line && !amountMinor) return null;
  if (amountMinor <= 0) return null;
  return {
    amountMinor,
    serviceFeeMinor: order.voucherServiceFeeMinor ?? line?.serviceFeeMinor ?? 0,
    deliveryMinor: order.voucherDeliveryMinor ?? line?.deliveryMinor ?? 0,
  };
}

export const VOUCHER_LINE_LABEL = "Voucher (GRIDGO-funded)";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const ERROR_COPY: Record<string, string> = {
  forbidden: "Only Super Admin can change vouchers.",
  voucher_campaign_not_found: "That campaign no longer exists.",
  voucher_campaign_unavailable:
    "The campaign is not active, so nothing was issued. Launch or resume it first.",
  voucher_campaign_cap_reached:
    "This list would go past the campaign's limit, so nothing was issued. Issue to fewer addresses, or create another campaign.",
  voucher_campaign_immutable:
    "The terms are locked because the campaign was launched or someone already holds one. Create a new campaign to change the offer.",
  voucher_campaign_status_conflict: "The campaign changed since you opened it. Reload and try again.",
  voucher_campaign_expired: "The campaign's end date has passed, so it cannot go live.",
  voucher_assigned_campaign_required: "Only a campaign issued by GRIDGO can be issued to a list.",
  voucher_code_exists: "Another campaign already uses that code. Pick another, or leave it blank for a generated one.",
  invalid_voucher_campaign: "Something in the terms is out of range. Check each field.",
  invalid_voucher_validity: "Choose either a number of days or an end date that is still ahead.",
  invalid_voucher_recipients: `Issue to between 1 and ${VOUCHER_LIMITS.recipientsMax.toLocaleString("en-PH")} addresses at a time.`,
  invalid_voucher_csv: "The file is not a CSV the API can read.",
  invalid_voucher_csv_header: "The file's first row must be email, or email,adultConfirmed.",
  voucher_csv_too_large: "The file is over 1 MB. Split it and issue in parts.",
  voucher_reason_required: `Write a reason (up to ${VOUCHER_LIMITS.reasonMax.toLocaleString("en-PH")} characters).`,
  voucher_not_found: "That voucher no longer exists.",
  voucher_not_voidable: "Only an available voucher can be voided. Reload to see where it stands.",
  voucher_payment_reconciliation_required:
    "A submitted checkout is holding this voucher. Settle that payment, or cancel the checkout, before voiding it.",
  voucher_not_reissuable: "Only a voided voucher can be reissued.",
  voucher_expired:
    "This voucher has expired, so it cannot be reissued. Issue a new campaign if the client should get another.",
  invalid_voucher_date: "Check the dates in the filter.",
  invalid_pagination: "Reload the log and try again.",
};

export function voucherErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    if (ERROR_COPY[err.code]) return ERROR_COPY[err.code];
    if (err.kind === "forbidden") return ERROR_COPY.forbidden;
    if (err.kind === "server") return "The API had a problem. Try again in a moment.";
    return fallback;
  }
  return "Could not reach the API. Check your connection, then try again.";
}

/** Errors that mean the screen is out of date: reload before anything else. */
export function voucherErrorIsStale(err: unknown): boolean {
  return (
    isApiError(err) &&
    [
      "voucher_campaign_not_found",
      "voucher_campaign_immutable",
      "voucher_campaign_status_conflict",
      "voucher_not_found",
      "voucher_not_voidable",
      "voucher_not_reissuable",
    ].includes(err.code)
  );
}
