/**
 * Sample First (gridgo-api#222, contract `gridgo-api/docs/SAMPLE_FIRST_API.md`).
 *
 * A client orders one paid sample of a listing before the full batch. The
 * sample is an ordinary order; the intended batch is kept as a draft holding a
 * private copy of the shop's price list for `sampleBatchHoldDays` (default 14)
 * after the sample is delivered. The client approves with a tick and a photo,
 * then orders the batch at the held price. The approval is the batch standard
 * in a dispute.
 *
 * Every word the dashboard shows about it lives here.
 */

import type {
  Order,
  SampleBatch,
  SampleBatchPrice,
  SampleDecision,
  SampleHeldPricing,
} from "@/lib/api/types";
import { formatDate, formatDateTime, formatPhp } from "@/lib/format";
import { unitLine, type PricingUnit } from "@/lib/listings";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

// ---------------------------------------------------------------------------
// Order tags
// ---------------------------------------------------------------------------

export const SAMPLE_TAG = "sample";
export const BATCH_FROM_SAMPLE_TAG = "batch_from_sample";

export type SampleTagKind = "sample" | "batch";

export const SAMPLE_TAG_LABEL: Record<SampleTagKind, string> = {
  sample: "Sample",
  batch: "Batch from sample",
};

export const SAMPLE_TAG_ICON: Record<SampleTagKind, StatusIconName> = {
  sample: "test-tube-diagonal",
  batch: "layers",
};

type Tagged = Pick<Order, "orderTags">;

/** "sample", "batch" or null, from the order's `orderTags`. */
export function sampleTagOf(order: Tagged | null | undefined): SampleTagKind | null {
  const tags = Array.isArray(order?.orderTags) ? order.orderTags : [];
  if (tags.includes(SAMPLE_TAG)) return "sample";
  if (tags.includes(BATCH_FROM_SAMPLE_TAG)) return "batch";
  return null;
}

/** The order on the other end of the link, with the words for it. */
export function linkedOrderOf(
  order: Pick<Order, "orderTags" | "batchOrderId" | "sampleOrderId">,
): { orderId: string; label: string } | null {
  const kind = sampleTagOf(order);
  if (kind === "sample" && order.batchOrderId) {
    return { orderId: order.batchOrderId, label: "Open the batch order" };
  }
  if (kind === "batch" && order.sampleOrderId) {
    return { orderId: order.sampleOrderId, label: "Open the sample order" };
  }
  return null;
}

/** Words the Order column's filter box matches. */
export function sampleTagFilterText(order: Tagged): string {
  const kind = sampleTagOf(order);
  return kind ? SAMPLE_TAG_LABEL[kind] : "";
}

// ---------------------------------------------------------------------------
// The client's decision
// ---------------------------------------------------------------------------

/** "Approved with a tick", or for a later signed method, "Approved". */
export function decisionMethodLabel(method: string | null | undefined): string {
  return method === "tick" ? "Approved with a tick" : "Approved";
}

export function rejectionNextLabel(next: string | null | undefined): string {
  if (next === "resample") return "Client will order another sample";
  if (next === "cancel") return "Client cancelled the batch";
  return "Client rejected the sample";
}

export type DecisionView = {
  decision: "approved" | "rejected";
  headline: string;
  tone: StatusTone;
  icon: StatusIconName;
  at: string;
  photoFileId: string | null;
  note: string | null;
};

/** The decision as a headline, a chip and its evidence. */
export function presentDecision(decision: SampleDecision | null | undefined): DecisionView | null {
  if (!decision || typeof decision !== "object") return null;
  if (decision.decision === "rejected") {
    return {
      decision: "rejected",
      headline: rejectionNextLabel(decision.next),
      tone: "warning",
      icon: "circle-x",
      at: decision.at,
      photoFileId: null,
      note: decision.reason || null,
    };
  }
  // An unknown method is a signed approval that shipped later: still approved.
  const approved = decision as Extract<SampleDecision, { decision: "approved" }>;
  return {
    decision: "approved",
    headline: decisionMethodLabel(approved.method),
    tone: "success",
    icon: "circle-check",
    at: approved.at,
    photoFileId: approved.samplePhotoFileId ?? null,
    note: approved.note?.trim() ? approved.note.trim() : null,
  };
}

/** One line for a dispute: what the batch is held to. */
export const BATCH_STANDARD_HELP =
  "The client approved this sample before ordering the batch. Judge the batch against it.";

// ---------------------------------------------------------------------------
// Batch drafts
// ---------------------------------------------------------------------------

type Presented = { label: string; tone: StatusTone; icon: StatusIconName };

const STATUS: Record<string, Presented> = {
  awaiting_sample: { label: "Waiting for the sample", tone: "info", icon: "clock" },
  approved: { label: "Sample approved", tone: "success", icon: "circle-check" },
  ordered: { label: "Batch ordered", tone: "success", icon: "layers" },
  rejected: { label: "Sample rejected", tone: "warning", icon: "circle-x" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "ban" },
};

export function presentSampleBatchStatus(status: string): Presented {
  return STATUS[status] ?? { label: "Unknown", tone: "neutral", icon: "circle-help" };
}

export const SAMPLE_BATCH_FILTERS = [
  { id: "open", label: "Open" },
  { id: "awaiting_sample", label: "Waiting for the sample" },
  { id: "approved", label: "Approved" },
  { id: "ordered", label: "Batch ordered" },
  { id: "closed", label: "Rejected or cancelled" },
  { id: "all", label: "All" },
] as const;

export type SampleBatchFilter = (typeof SAMPLE_BATCH_FILTERS)[number]["id"];

export function isSampleBatchFilter(value: unknown): value is SampleBatchFilter {
  return SAMPLE_BATCH_FILTERS.some((row) => row.id === value);
}

export function matchesSampleBatchFilter(row: SampleBatch, filter: SampleBatchFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "open":
      return row.status === "awaiting_sample" || row.status === "approved";
    case "closed":
      return row.status === "rejected" || row.status === "cancelled";
    default:
      return row.status === filter;
  }
}

export function sampleBatchFilterCounts(
  rows: readonly SampleBatch[],
): Record<SampleBatchFilter, number> {
  const counts = Object.fromEntries(SAMPLE_BATCH_FILTERS.map((row) => [row.id, 0])) as Record<
    SampleBatchFilter,
    number
  >;
  for (const row of rows) {
    for (const filter of SAMPLE_BATCH_FILTERS) {
      if (matchesSampleBatchFilter(row, filter.id)) counts[filter.id] += 1;
    }
  }
  return counts;
}

/**
 * Open rows first: an approved draft whose hold ends soonest leads, then the
 * ones still waiting for their sample, then the rest newest first.
 */
export function sortSampleBatches(rows: readonly SampleBatch[]): SampleBatch[] {
  const rank = (row: SampleBatch) =>
    row.status === "approved" ? 0 : row.status === "awaiting_sample" ? 1 : 2;
  return [...rows].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    if (rank(a) === 0 && a.heldUntil && b.heldUntil && a.heldUntil !== b.heldUntil) {
      return a.heldUntil.localeCompare(b.heldUntil);
    }
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const daysWord = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

/** "3 days left", "5 hours left", or null once it has run out. */
export function timeLeft(until: string | null, now: number = Date.now()): string | null {
  if (!until) return null;
  const ms = Date.parse(until) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms >= DAY_MS) return `${daysWord(Math.floor(ms / DAY_MS))} left`;
  const hours = Math.max(1, Math.floor(ms / HOUR_MS));
  return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
}

export type HoldClock = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** One sentence with the dates. */
  line: string;
};

/** The held price's clock, in words. */
export function holdClock(row: SampleBatch, now: number = Date.now()): HoldClock {
  const length = daysWord(row.holdDays);
  if (row.status === "ordered") {
    return {
      label: "Used",
      tone: "neutral",
      icon: "circle-check",
      line: "The batch has been ordered from this sample.",
    };
  }
  if (row.status === "rejected" || row.status === "cancelled") {
    return {
      label: "Closed",
      tone: "neutral",
      icon: "ban",
      line: row.heldUntil
        ? `The price was held until ${formatDateTime(row.heldUntil)}.`
        : "No batch will be ordered from this sample.",
    };
  }
  if (!row.heldUntil) {
    return {
      label: "Not started",
      tone: "info",
      icon: "clock",
      line: `The price is held for ${length} once the sample is delivered.`,
    };
  }
  const left = row.holdExpired ? null : timeLeft(row.heldUntil, now);
  if (!left) {
    return {
      label: "Expired",
      tone: "warning",
      icon: "triangle-alert",
      line: `The held price ended ${formatDateTime(row.heldUntil)}. The client can still order the batch at today's price.`,
    };
  }
  return {
    label: left,
    tone: "info",
    icon: "clock",
    line: `Sample delivered ${formatDate(row.sampleDeliveredAt)}. The price is held until ${formatDateTime(row.heldUntil)}.`,
  };
}

/** Why the held price cannot be used now, in words; null when it can. */
export function heldPriceBlockerLine(code: string | null | undefined): string | null {
  switch (code) {
    case null:
    case undefined:
    case "":
      return null;
    case "sample_batch_not_approved":
      return "The client has not approved the sample yet.";
    case "sample_hold_expired":
      return "The hold has ended. Only today's price is open.";
    case "sample_shop_changed":
      return "Another shop made the sample, so the price was not held.";
    case "sample_batch_ordered":
      return "The batch has already been ordered.";
    default:
      return "The held price cannot be used right now.";
  }
}

/** "₱1,234.00 for 500", or a dash when it cannot be priced. */
export function priceLine(price: SampleBatchPrice | null | undefined): string {
  if (!price) return "Cannot be priced";
  return `${formatPhp(price.clientItemMinor)} for ${price.quantity.toLocaleString("en-PH")}`;
}

/** The held unit in the listing's own words ("per pack of 100"). */
export function heldUnitLabel(unit: string, packageQty: number | null): string {
  return unitLine({
    pricingUnit: unit as PricingUnit,
    packageQty,
    measureUnit: null,
  });
}

/** An option's price effect: "+₱2.00", "×1.10", "+₱2.00 and ×1.10", or "No change". */
export function optionEffect(option: SampleHeldPricing["options"][number]): string {
  const parts: string[] = [];
  if (option.priceModifierMinor) {
    const sign = option.priceModifierMinor > 0 ? "+" : "−";
    parts.push(`${sign}${formatPhp(Math.abs(option.priceModifierMinor))}`);
  }
  if (option.priceMultiplierBps != null && option.priceMultiplierBps !== 10_000) {
    parts.push(`×${(option.priceMultiplierBps / 10_000).toFixed(2)}`);
  }
  return parts.length ? parts.join(" and ") : "No change";
}

/** A speed tier's price effect, when it has one. */
export function speedTierLine(speed: SampleHeldPricing["speedTier"]): string {
  if (!speed) return "Standard speed";
  const name = speed.label?.trim() || "Chosen speed";
  if (speed.priceMinor != null) return `${name}, ${formatPhp(speed.priceMinor)} per piece`;
  if (speed.surchargeMinor) return `${name}, +${formatPhp(speed.surchargeMinor)}`;
  return name;
}

// ---------------------------------------------------------------------------
// Setting
// ---------------------------------------------------------------------------

export const SAMPLE_HOLD_DAYS = { min: 1, max: 90, default: 14 } as const;

/** Typed text → whole days in range, or null. */
export function parseHoldDays(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= SAMPLE_HOLD_DAYS.min && days <= SAMPLE_HOLD_DAYS.max ? days : null;
}

export { daysWord as holdDaysWord };

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/** Staff inbox headlines (SAMPLE_FIRST_API.md "Inbox, realtime and audit"). */
export const SAMPLE_INBOX_HEADLINES: Record<string, string> = {
  sample_approved: "Client approved a sample",
  sample_rejected: "Client rejected a sample",
  sample_batch_cancelled: "Client cancelled a sampled batch",
  sample_batch_ordered: "Batch ordered from an approved sample",
};
