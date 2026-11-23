/**
 * Shop money for Operations and Super Admin (gridgo-api#416, contract
 * `gridgo-api/docs/SHOP_MONEY_API.md`): two running balances per shop, the
 * 4 PM daily run, the one transfer each shop is sent, and Pay GRIDGO.
 *
 * Pure helpers only, so every rule the desk shows is testable without a
 * screen. Amounts stay in PHP centavos; format only at the edge.
 */

import { isApiError } from "@/lib/api/client";
import type {
  ShopMoneyDesk,
  ShopMoneyItem,
  ShopMoneyLedgerEntry,
  ShopMoneyRun,
  ShopMoneyRunShop,
  ShopMoneySettings,
  ShopMoneyShopRow,
  ShopMoneyTransfer,
  ShopMoneyTransferStatus,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { presentMilestone } from "@/lib/order-state";

export type Presented = { label: string; tone: StatusTone; icon: StatusIconName };

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

/**
 * The four states a prepared transfer can be in, each with the one thing the
 * person must (or must not) do next.
 */
export const TRANSFER_STATE: Record<ShopMoneyTransferStatus, Presented & { next: string }> = {
  transfer_reserved: {
    label: "Prepared, not recorded",
    tone: "warning",
    icon: "clock",
    next: "Send this amount once, then record the transfer with its receipt.",
  },
  transfer_unknown: {
    label: "Outcome unknown",
    tone: "error",
    icon: "triangle-alert",
    next: "Do not send again. Check the wallet or bank, then record it as sent or as not sent.",
  },
  transfer_paid: {
    label: "Sent",
    tone: "success",
    icon: "circle-check",
    next: "Recorded. The shop sees the reference in Money.",
  },
  transfer_cancelled: {
    label: "Not sent",
    tone: "neutral",
    icon: "ban",
    next: "Confirmed unsent. The amount stays owed and joins a later run.",
  },
};

export function transferStatusOf(transfer: Pick<ShopMoneyTransfer, "status">): ShopMoneyTransferStatus {
  return transfer.status ?? "transfer_reserved";
}

/** Prepared or unknown: money may be in flight, so the transfer still needs a person. */
export function transferOpen(status: ShopMoneyTransferStatus): boolean {
  return status === "transfer_reserved" || status === "transfer_unknown";
}

/**
 * Who may record, mark or cancel a transfer: the person who prepared it, or
 * Super Admin (the API answers `403 verification_payer_required` otherwise).
 */
export function canActOnTransfer(
  transfer: Pick<ShopMoneyTransfer, "data">,
  viewer: { userId: string | null | undefined; superAdmin: boolean },
): boolean {
  if (viewer.superAdmin) return true;
  return Boolean(viewer.userId) && transfer.data.payerId === viewer.userId;
}

/** A transfer whose whole amount is covered by debt recovery: nothing to send. */
export function isOffsetTransfer(transfer: Pick<ShopMoneyTransfer, "data">): boolean {
  return transfer.data.netAmountMinor === 0;
}

export function recoveredMinor(items: readonly ShopMoneyItem[]): number {
  return items.reduce((sum, item) => sum + (item.recoveryMinor ?? 0), 0);
}

/** The newest transfer for one shop in one run, if any. */
export function transferFor(
  transfers: readonly ShopMoneyTransfer[],
  runId: string,
  supplierId: string,
): ShopMoneyTransfer | null {
  for (let i = transfers.length - 1; i >= 0; i -= 1) {
    const t = transfers[i];
    if (t.data.runId === runId && t.supplierId === supplierId) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The daily run
// ---------------------------------------------------------------------------

/** Where one shop stands in a run, in the order the desk lists them. */
export type RunLane = "to_send" | "in_flight" | "done" | "owes" | "rolled_over" | "held" | "nothing";

export type RunRow = {
  shop: ShopMoneyRunShop;
  lane: RunLane;
  transfer: ShopMoneyTransfer | null;
  status: ShopMoneyTransferStatus | null;
};

export const RUN_LANES: { lane: RunLane; title: string; empty: string }[] = [
  { lane: "to_send", title: "Ready to prepare", empty: "No shop is waiting to be prepared." },
  { lane: "in_flight", title: "Prepared or unknown", empty: "No transfer is waiting to be recorded." },
  { lane: "done", title: "Recorded", empty: "Nothing recorded from this run yet." },
  { lane: "owes", title: "Owes GRIDGO", empty: "" },
  { lane: "rolled_over", title: "Below the minimum", empty: "" },
  { lane: "held", title: "Held", empty: "" },
];

function laneOf(shop: ShopMoneyRunShop, status: ShopMoneyTransferStatus | null, currentNetMinor: number | undefined): RunLane {
  if (status && transferOpen(status)) return "in_flight";
  if (status === "transfer_paid") return "done";
  // A cancelled attempt's balance rolls into a later run, not this one.
  if (status === "transfer_cancelled") return "done";
  if (shop.items.length > 0) return "to_send";
  // The run is a snapshot; a debt paid since then is done, not still owed.
  if (shop.netMinor < 0) return (currentNetMinor ?? shop.netMinor) < 0 ? "owes" : "done";
  if (shop.rolloverMinor > 0) return "rolled_over";
  if (shop.held.length > 0) return "held";
  return "nothing";
}

/** Every shop in a run with its lane and transfer; shops with nothing at all are left out. */
export function runRows(
  run: ShopMoneyRun,
  transfers: readonly ShopMoneyTransfer[],
  current: readonly Pick<ShopMoneyShopRow, "supplierId" | "netMinor">[] = [],
): RunRow[] {
  const now = new Map(current.map((s) => [s.supplierId, s.netMinor]));
  const order: RunLane[] = ["in_flight", "to_send", "done", "owes", "rolled_over", "held", "nothing"];
  return run.data.shops
    .map((shop) => {
      const transfer = transferFor(transfers, run.id, shop.supplierId);
      const status = transfer ? transferStatusOf(transfer) : null;
      return { shop, transfer, status, lane: laneOf(shop, status, now.get(shop.supplierId)) };
    })
    .filter((row) => row.lane !== "nothing")
    .sort(
      (a, b) =>
        order.indexOf(a.lane) - order.indexOf(b.lane) ||
        b.shop.amountMinor - a.shop.amountMinor ||
        b.shop.rolloverMinor - a.shop.rolloverMinor,
    );
}

export function latestRun(desk: Pick<ShopMoneyDesk, "runs">): ShopMoneyRun | null {
  return desk.runs.length ? desk.runs[desk.runs.length - 1] : null;
}

/** Sum of what a run may still send: shops ready to prepare. */
export function runTotals(rows: readonly RunRow[]): { toSendMinor: number; toSend: number; inFlight: number; done: number } {
  let toSendMinor = 0;
  let toSend = 0;
  let inFlight = 0;
  let done = 0;
  for (const row of rows) {
    if (row.lane === "to_send") {
      toSendMinor += row.shop.amountMinor;
      toSend += 1;
    } else if (row.lane === "in_flight") inFlight += 1;
    else if (row.lane === "done") done += 1;
  }
  return { toSendMinor, toSend, inFlight, done };
}

/** Transfers that still need a person, anywhere in the last 100: unknown first. */
export function openTransfers(transfers: readonly ShopMoneyTransfer[]): ShopMoneyTransfer[] {
  return transfers
    .filter((t) => transferOpen(transferStatusOf(t)))
    .sort((a, b) => {
      const rank = (t: ShopMoneyTransfer) => (transferStatusOf(t) === "transfer_unknown" ? 0 : 1);
      return rank(a) - rank(b) || a.at.localeCompare(b.at);
    });
}

/** A run row whose debt to GRIDGO was paid after the run. */
export function paidSinceRun(row: RunRow): boolean {
  return row.lane === "done" && !row.status && row.shop.netMinor < 0;
}

/** Rail count: transfers prepared or unknown, the only shop-money work that can leave money in limbo. */
export function shopMoneyNeedsAction(desk: Pick<ShopMoneyDesk, "transfers">): number {
  return openTransfers(desk.transfers).length;
}

// ---------------------------------------------------------------------------
// Items and holds
// ---------------------------------------------------------------------------

/** One line for a payable item: what it pays for, without the order id. */
export function itemLabel(key: string): string {
  const [kind, , code] = key.split(":");
  switch (kind) {
    case "stage":
      return code ? presentMilestone(code) : "Payout stage";
    case "change":
      return "Paid change extra";
    case "settlement":
      return "Refund settlement remainder";
    case "bonus":
      return "Launch-week bonus";
    default:
      return "Payout item";
  }
}

export function itemOrderId(key: string): string | null {
  const [kind, id] = key.split(":");
  return kind && kind !== "settlement" && id ? id : null;
}

/** Why an item is not in today's transfer, in words the team can act on. */
const HELD_COPY: Record<string, string> = {
  transfer_pending: "Already in a prepared transfer",
  supplier_principal_not_collected: "The client's payment is not confirmed yet",
  payout_held: "A claim, issue or refund request holds it",
  pof_required: "Waiting for the shop's proof",
  milestone_not_reached: "The job has not reached this stage",
  delivery_required: "Waiting for delivery",
  issue_window_open: "The complaint window is still open",
  verification_payout_cap: "Over the unverified shop's payout cap",
  verification_open_jobs: "Too many open regular jobs before verification",
  verification_transfer_unknown: "An earlier transfer's outcome is unknown",
  production_penalty_pending: "Late-production deduction not worked out yet",
  claim_hold_active: "A claim holds it",
};

export function heldReason(code: string): string {
  return HELD_COPY[code] ?? "Waiting on another check";
}

/** Holds grouped by reason with counts: "2 waiting for delivery". */
export function heldSummary(held: readonly { reason: string }[]): { reason: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const h of held) counts.set(h.reason, (counts.get(h.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, label: heldReason(reason), count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/** One status for a shop's balances, worst first. */
export function balanceStatus(row: Pick<ShopMoneyShopRow, "paused" | "overdue" | "netMinor" | "owedMinor" | "owingMinor">): Presented {
  if (row.paused) return { label: "New orders paused", tone: "error", icon: "circle-x" };
  if (row.overdue) return { label: "Pay GRIDGO overdue", tone: "error", icon: "triangle-alert" };
  if (row.netMinor < 0) return { label: "Owes GRIDGO", tone: "warning", icon: "triangle-alert" };
  if (row.netMinor > 0) return { label: "GRIDGO owes", tone: "info", icon: "clock" };
  return { label: "Settled", tone: "success", icon: "circle-check" };
}

/** Paused and owing shops first, then the biggest amount GRIDGO owes. */
export function balanceOrder(a: ShopMoneyShopRow, b: ShopMoneyShopRow): number {
  const rank = (r: ShopMoneyShopRow) => (r.paused || r.overdue ? 0 : r.netMinor < 0 ? 1 : r.netMinor > 0 ? 2 : 3);
  return rank(a) - rank(b) || Math.abs(b.netMinor) - Math.abs(a.netMinor) || a.supplierId.localeCompare(b.supplierId);
}

/** Shops with any money on the ledger at all. */
export function activeBalances(rows: readonly ShopMoneyShopRow[]): ShopMoneyShopRow[] {
  return rows.filter((r) => r.owedMinor || r.owingMinor || r.paidMinor || r.paused || r.overdue).sort(balanceOrder);
}

/** "₱1,250.00 to the shop", "₱80.00 to GRIDGO", "Even". */
export function netWords(netMinor: number): string {
  if (netMinor > 0) return `${formatPhp(netMinor)} to the shop`;
  if (netMinor < 0) return `${formatPhp(-netMinor)} to GRIDGO`;
  return "Even";
}

const LEDGER_WORDS: Record<string, string> = {
  entitlement: "Shop pay earned",
  payout: "Paid to the shop",
  bonus_award: "Launch-week bonus",
  bonus_void: "Launch-week bonus voided",
  bonus_payout: "Launch-week bonus paid",
  recovery_due: "Owed to GRIDGO",
  recovered: "Recovered by GRIDGO",
};

export function ledgerLine(entry: Pick<ShopMoneyLedgerEntry, "kind" | "owedDeltaMinor">): string {
  if (entry.kind === "entitlement" && entry.owedDeltaMinor < 0) return "Shop pay reduced";
  return LEDGER_WORDS[entry.kind] ?? "Ledger change";
}

/** Newest first; zero-change rows (a bonus that never applied) are noise. */
export function ledgerRows(history: readonly ShopMoneyLedgerEntry[]): ShopMoneyLedgerEntry[] {
  return [...history].filter((e) => e.owedDeltaMinor || e.owingDeltaMinor).sort((a, b) => b.at.localeCompare(a.at));
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  in_app_qr: "In-app QR",
  cash_to_rider: "Cash to rider",
  voucher: "Voucher",
  counter_cash: "Cash at the counter",
};

// ---------------------------------------------------------------------------
// Times: everything is Manila, whatever the reader's clock says
// ---------------------------------------------------------------------------

const MANILA_OFFSET_MS = 8 * 3600_000;

/** `YYYY-MM-DDTHH:mm` in Manila for a `datetime-local` field. */
export function manilaLocalInput(at: Date | number = Date.now()): string {
  return new Date(Number(at) + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

/** A `datetime-local` value read as Manila time → ISO. Stable: the same input gives the same string. */
export function manilaInputToIso(value: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** "4:00 PM" from "16:00". */
export function clockWords(hhmm: string): string {
  const m = /^(\d\d):(\d\d)$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** "Tue 24 Nov, 4:00 PM" in Manila. */
export function manilaWhenWords(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

/** The run's date, "Tuesday 24 November", from its `YYYY-MM-DD`. */
export function runDateWords(date: string): string {
  const ms = Date.parse(`${date}T12:00:00+08:00`);
  if (!Number.isFinite(ms)) return date;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(ms));
}

/** Is this run today's, in Manila? */
export function isTodaysRun(run: ShopMoneyRun, now: number = Date.now()): boolean {
  return run.data.date === manilaLocalInput(now).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Recording a transfer
// ---------------------------------------------------------------------------

export type TransferRecordDraft = {
  typedAmount: number | null;
  paidAtIso: string | null;
  reference: string;
  hasReceipt: boolean;
  confirmed: boolean;
  reason: string;
};

/**
 * What still stops "Record transfer" for a positive transfer, in the order a
 * person fixes them. Mirrors `409 verification_net_payout_amount_required`,
 * `verification_actual_transfer_evidence_required` and
 * `invalid_supplier_transfer_paid_at` before the press.
 */
export function transferRecordBlockers(
  frozenMinor: number,
  draft: TransferRecordDraft,
  now: number = Date.now(),
): string[] {
  const out: string[] = [];
  if (draft.typedAmount === null) out.push("Type the amount you sent.");
  else if (draft.typedAmount !== frozenMinor)
    out.push(
      `That is not the prepared ${formatPhp(frozenMinor)}. If a different amount went out, mark this transfer unknown instead.`,
    );
  if (!draft.paidAtIso) out.push("Enter when the money was sent.");
  else if (Date.parse(draft.paidAtIso) > now) out.push("The time sent cannot be in the future.");
  const ref = draft.reference.trim();
  if (!ref) out.push("Enter the reference number from the receipt.");
  else if (ref.length > 80) out.push("The reference is longer than 80 characters.");
  if (!draft.hasReceipt) out.push("Add the receipt screenshot.");
  if (!draft.reason.trim()) out.push("Write a note for the record.");
  if (!draft.confirmed) out.push("Tick that the money was sent.");
  return out;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const SHOP_MONEY_DEFAULTS: Omit<ShopMoneySettings, "launchedAt"> = {
  payoutTime: "16:00",
  minimumMinor: 10000,
  payDeadline: "18:00",
  reminderTime: "17:00",
  bonusRateBps: 2000,
  bonusDays: 7,
  bonusCapMinor: 50000,
  businessWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
  extraBusinessDates: [],
};

export const WEEKDAYS = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 0, short: "Sun", long: "Sunday" },
] as const;

/** A list of dates typed one per line or comma-separated → sorted unique `YYYY-MM-DD`, or the first bad entry. */
export function parseDateList(text: string): { dates: string[] } | { bad: string } {
  const parts = text
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const dates = new Set<string>();
  for (const p of parts) {
    if (!/^\d{4}-\d\d-\d\d$/.test(p)) return { bad: p };
    const d = new Date(`${p}T00:00:00Z`);
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== p) return { bad: p };
    dates.add(p);
  }
  return { dates: [...dates].sort() };
}

/** Field problems, mirroring `400 invalid_shop_money_settings` before saving. */
export function shopMoneySettingsProblems(s: Omit<ShopMoneySettings, "launchedAt">): Partial<Record<keyof ShopMoneySettings, string>> {
  const out: Partial<Record<keyof ShopMoneySettings, string>> = {};
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const k of ["payoutTime", "reminderTime", "payDeadline"] as const) if (!time.test(s[k])) out[k] = "Use a time like 16:00.";
  if (!out.payoutTime && !out.reminderTime && s.payoutTime >= s.reminderTime)
    out.reminderTime = "The reminder comes after the payout run.";
  if (!out.reminderTime && !out.payDeadline && s.reminderTime >= s.payDeadline)
    out.payDeadline = "The deadline comes after the reminder.";
  if (!Number.isSafeInteger(s.minimumMinor) || s.minimumMinor < 1) out.minimumMinor = "At least ₱0.01.";
  if (!Number.isSafeInteger(s.bonusRateBps) || s.bonusRateBps < 0 || s.bonusRateBps > 10000) out.bonusRateBps = "0 to 100%.";
  if (!Number.isSafeInteger(s.bonusDays) || s.bonusDays < 0 || s.bonusDays > 365) out.bonusDays = "0 to 365 days.";
  if (!Number.isSafeInteger(s.bonusCapMinor) || s.bonusCapMinor < 0) out.bonusCapMinor = "₱0 or more.";
  if (!s.businessWeekdays.length) out.businessWeekdays = "Pick at least one payout day.";
  return out;
}

/** The fields that changed, for the audit reason: "payout time 16:00 → 15:30; minimum ₱100.00 → ₱150.00". */
export function shopMoneyChangeSummary(
  from: Omit<ShopMoneySettings, "launchedAt">,
  to: Omit<ShopMoneySettings, "launchedAt">,
): string[] {
  const out: string[] = [];
  const pct = (bps: number) => `${bps / 100}%`;
  const days = (list: number[]) =>
    WEEKDAYS.filter((w) => list.includes(w.day))
      .map((w) => w.short)
      .join(" ");
  if (from.payoutTime !== to.payoutTime) out.push(`payout time ${from.payoutTime} → ${to.payoutTime}`);
  if (from.reminderTime !== to.reminderTime) out.push(`reminder ${from.reminderTime} → ${to.reminderTime}`);
  if (from.payDeadline !== to.payDeadline) out.push(`Pay GRIDGO deadline ${from.payDeadline} → ${to.payDeadline}`);
  if (from.minimumMinor !== to.minimumMinor) out.push(`minimum ${formatPhp(from.minimumMinor)} → ${formatPhp(to.minimumMinor)}`);
  if (from.bonusRateBps !== to.bonusRateBps) out.push(`bonus rate ${pct(from.bonusRateBps)} → ${pct(to.bonusRateBps)}`);
  if (from.bonusDays !== to.bonusDays) out.push(`bonus days ${from.bonusDays} → ${to.bonusDays}`);
  if (from.bonusCapMinor !== to.bonusCapMinor) out.push(`bonus cap ${formatPhp(from.bonusCapMinor)} → ${formatPhp(to.bonusCapMinor)}`);
  if (days(from.businessWeekdays) !== days(to.businessWeekdays))
    out.push(`payout days ${days(from.businessWeekdays)} → ${days(to.businessWeekdays)}`);
  if (from.holidays.join() !== to.holidays.join()) out.push(`holidays (${to.holidays.length})`);
  if (from.extraBusinessDates.join() !== to.extraBusinessDates.join())
    out.push(`extra payout days (${to.extraBusinessDates.length})`);
  return out;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const ERROR_COPY: Record<string, string> = {
  verification_payer_required:
    "Another person prepared this transfer, so only they or Super Admin can record or change it. Ask them before sending anything.",
  settlement_minimum_not_met:
    "Since the run, this shop's payable amount changed and is now under the minimum. Nothing was reserved; it rolls into the next run.",
  payout_qr_required: "This shop has no receiving QR on file, so no transfer can be prepared. Ask the shop to add one in Money.",
  settlement_not_found: "That run or shop is no longer listed. Reload the desk.",
  transfer_not_found: "That transfer is no longer listed. Reload the desk.",
  transfer_reconciliation_required:
    "This transfer was already recorded differently. Reload to see what was recorded; nothing was changed.",
  payment_reference_conflict:
    "That reference is already recorded on another payment. Check the receipt and type its own reference.",
  verification_net_payout_amount_required:
    "The amount must be exactly the prepared amount. If a different amount went out, mark the transfer unknown.",
  verification_actual_transfer_evidence_required:
    "The receipt screenshot and its reference are both needed. Upload the receipt again if it did not finish.",
  invalid_supplier_transfer_paid_at: "The time sent must be a real time, not in the future.",
  verification_reservation_confirmation_required: "Tick that you checked no money was sent.",
  reason_required: "Write a note for the record.",
  payout_held: "A claim, issue or refund request now holds part of this transfer. Reload the shop.",
  payment_amount_changed:
    "What this shop owes changed since you opened it (a payout may have recovered part of it). Reload and confirm the new amount.",
  verification_transfer_reconciliation_required:
    "A prepared transfer for this shop already recovers part of this debt. Record or cancel that transfer first, so the debt is not collected twice.",
  invalid_shop_payment: "Enter the bank reference and a note.",
  payment_request_not_found: "That Pay GRIDGO request is no longer open. Reload the shop.",
  shop_money_stale: "Someone changed this shop's policy a moment ago. Reload and look again.",
  cash_supplier_verification_required: "Only a verified shop can take cash at the counter.",
  payment_qr_required: "GRIDGO's receiving QR is not set in Operational settings yet, so shops could not pay it.",
  invalid_shop_money_policy: "Write a reason for the record.",
  invalid_shop_money_settings: "One of the payout settings is not valid. Check the times, amounts and days.",
  shop_money_launch_immutable: "The launch date cannot be changed.",
  settings_version_conflict:
    "Someone else saved settings a moment ago. Their values are now shown. Check your change against them, then save again.",
};

/** Plain recovery copy for a shop-money error; `fallback` for anything not named. */
export function shopMoneyErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    if (err.code && ERROR_COPY[err.code]) return ERROR_COPY[err.code];
    if (err.kind === "forbidden") return "Your account cannot do this here.";
    if (err.kind === "server") return "GRIDGO's server had a problem. Nothing new was recorded; try again in a moment.";
  }
  if (err instanceof TypeError || (err instanceof Error && err.name === "AbortError"))
    return "The connection dropped before GRIDGO answered. Reload to see whether it was recorded before trying again.";
  return fallback;
}

/** API without the shop money routes. */
export function shopMoneyUnavailable(err: unknown): boolean {
  return isApiError(err) && err.status === 404 && (!err.code || err.code === "not_found");
}
