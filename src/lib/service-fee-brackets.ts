/**
 * GRIDGO's service fee in brackets (gridgo-api#220, report 5A07D2C2; contract
 * `gridgo-api/docs/SERVICE_FEE_API.md`).
 *
 * The fee is marginal, like income tax: each rate applies only to the part of
 * the shop price inside its bracket. With the shipped table (45% to ₱2,000,
 * 25% to ₱20,000, 15% above) a ₱5,000 job carries ₱2,000 × 45% + ₱3,000 × 25%
 * = ₱1,650, never 25% of the whole price, so a bigger order never costs less.
 *
 * Money stays in integer centavos and rates in basis points. The arithmetic is
 * the API's own (`src/service-fee.js`): exact numerators summed, rounded
 * half-up once, and each working row is the difference of rounded cumulative
 * fees so the rows always add up to the fee.
 *
 * Operations and Super Admin only. Clients see one combined printing price and
 * never the table, a rate or the working.
 *
 * Pure functions, unit tested.
 */

import type {
  OrderFeeLike,
  PlatformSettings,
  ServiceFeeBracket,
  ServiceFeeResult,
  ServiceFeeSchedule,
  ServiceFeeScheduleV2,
  ServiceFeeWorkingRow,
} from "@/lib/api/types";
import { bpsToPercentInput, formatRatePercent, percentInputToBps } from "@/components/settings/service-fee";
import { formatPhp } from "@/lib/format";

/** The API holds one to twenty brackets. */
export const MAX_BRACKETS = 20;

/** The six shop prices the preview prices under both tables, in the API's order. */
export const PREVIEW_PRICES_MINOR = [50_000, 199_900, 200_000, 500_000, 2_000_000, 5_000_000] as const;

/** The table the API ships for newly priced groups. */
export const SHIPPED_BRACKETS: ServiceFeeBracket[] = [
  { upToMinor: 200_000, rateBps: 4_500 },
  { upToMinor: 2_000_000, rateBps: 2_500 },
  { upToMinor: null, rateBps: 1_500 },
];

/** A version-2 table from its brackets, as the API stores one. */
export function bracketSchedule(brackets: ServiceFeeBracket[]): ServiceFeeScheduleV2 {
  return { version: 2, rounding: "half_up_once", brackets };
}

/** The brackets a schedule prices with; a flat (version 1) table is one open bracket. */
export function bracketsOf(schedule: ServiceFeeSchedule): ServiceFeeBracket[] {
  return schedule.version === 1 ? [{ upToMinor: null, rateBps: schedule.rateBps }] : schedule.brackets;
}

/**
 * The fee on one shop price under one table, with its working. Mirrors
 * `serviceFeeMoney` in gridgo-api exactly, BigInt numerators included.
 */
export function serviceFeeFor(principalMinor: number, schedule: ServiceFeeSchedule): ServiceFeeResult {
  if (!Number.isSafeInteger(principalMinor) || principalMinor < 0) {
    throw new RangeError("Shop price must be a whole, non-negative number of centavos.");
  }
  let lower = 0;
  let numerator = BigInt(0);
  let roundedSoFar = BigInt(0);
  const working = bracketsOf(schedule).map((band) => {
    const taxableMinor = Math.max(0, Math.min(principalMinor, band.upToMinor ?? principalMinor) - lower);
    numerator += BigInt(taxableMinor) * BigInt(band.rateBps);
    const cumulative = (numerator + BigInt(5_000)) / BigInt(10_000);
    const row: ServiceFeeWorkingRow = {
      fromMinor: lower,
      upToMinor: band.upToMinor,
      rateBps: band.rateBps,
      taxableMinor,
      amountMinor: Number(cumulative - roundedSoFar),
    };
    roundedSoFar = cumulative;
    lower = band.upToMinor ?? lower;
    return row;
  });
  return {
    grossServiceFeeMinor: Number(roundedSoFar),
    serviceFeeSchedule: schedule,
    serviceFeeWorking: working,
  };
}

/** Does this settings row price new orders in brackets? False on an API from before #220. */
export function hasBracketSettings(settings: Pick<PlatformSettings, "serviceFeeSchedule">): boolean {
  return Boolean(settings.serviceFeeSchedule);
}

/**
 * The table pricing new orders at `now`. A scheduled table whose date has
 * arrived is already in force on the API's reads, so it is in force here too.
 */
export function scheduleInForce(
  settings: Pick<PlatformSettings, "serviceFeeSchedule" | "scheduledServiceFee" | "serviceFeeRateBps">,
  now: Date = new Date(),
): ServiceFeeSchedule {
  const pending = settings.scheduledServiceFee;
  if (pending && Date.parse(pending.effectiveFrom ?? "") <= now.getTime()) return pending;
  return settings.serviceFeeSchedule ?? { version: 1, rateBps: settings.serviceFeeRateBps };
}

/** The table waiting for its date, or null when none is waiting. */
export function scheduledChange(
  settings: Pick<PlatformSettings, "scheduledServiceFee">,
  now: Date = new Date(),
): ServiceFeeScheduleV2 | null {
  const pending = settings.scheduledServiceFee;
  if (!pending?.effectiveFrom) return null;
  return Date.parse(pending.effectiveFrom) > now.getTime() ? pending : null;
}

export function sameBrackets(a: ServiceFeeBracket[], b: ServiceFeeBracket[]): boolean {
  return (
    a.length === b.length &&
    a.every((band, index) => band.upToMinor === b[index].upToMinor && band.rateBps === b[index].rateBps)
  );
}

// ---- Draft ------------------------------------------------------------------

/** One bracket as typed: the upper limit in pesos (blank on the last) and the rate in percent. */
export type BracketDraftRow = { upTo: string; rate: string };

/** "2000" for 200,000 centavos; "2000.5" for 200,050. */
function pesosInput(minor: number): string {
  const pesos = minor / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

export function bracketDraft(brackets: ServiceFeeBracket[]): BracketDraftRow[] {
  return brackets.map((band) => ({
    upTo: band.upToMinor === null ? "" : pesosInput(band.upToMinor),
    rate: bpsToPercentInput(band.rateBps),
  }));
}

/** "2,000" or "₱2,000.50" typed → centavos; null when it is not a peso amount. */
export function pesosInputToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/^₱/, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}

export type BracketProblem = {
  /** The row at fault, 0-based. */
  row: number;
  field: "upTo" | "rate";
  message: string;
};

/**
 * The typed table as the API takes it, or the first thing wrong with it,
 * mirroring `400 invalid_service_fee_schedule`: 1–20 brackets, limits whole
 * centavos that only go up, the last bracket open, rates 0–100%.
 */
export function parseBracketDraft(
  rows: BracketDraftRow[],
): { brackets: ServiceFeeBracket[] } | { problem: BracketProblem } {
  if (!rows.length || rows.length > MAX_BRACKETS) {
    return {
      problem: { row: 0, field: "upTo", message: `Use 1 to ${MAX_BRACKETS} brackets.` },
    };
  }
  const brackets: ServiceFeeBracket[] = [];
  let previous = 0;
  for (const [index, row] of rows.entries()) {
    const last = index === rows.length - 1;
    let upToMinor: number | null = null;
    if (!last) {
      upToMinor = pesosInputToMinor(row.upTo);
      if (upToMinor === null || upToMinor <= 0) {
        return {
          problem: {
            row: index,
            field: "upTo",
            message: `Bracket ${index + 1} needs an upper limit in pesos, like 2,000.`,
          },
        };
      }
      if (upToMinor <= previous) {
        return {
          problem: {
            row: index,
            field: "upTo",
            message: `Bracket ${index + 1} must end above ${formatPhp(previous)}, where bracket ${index} ends.`,
          },
        };
      }
      previous = upToMinor;
    }
    const rateBps = percentInputToBps(row.rate);
    if (rateBps === null) {
      return {
        problem: {
          row: index,
          field: "rate",
          message: `Bracket ${index + 1} needs a rate from 0 to 100%, up to two decimals.`,
        },
      };
    }
    brackets.push({ upToMinor, rateBps });
  }
  return { brackets };
}

/** A bracket added above the last limit: ten times it, at the last rate. */
export function withBracketAdded(rows: BracketDraftRow[]): BracketDraftRow[] {
  if (rows.length >= MAX_BRACKETS) return rows;
  const limits = rows.slice(0, -1).map((row) => pesosInputToMinor(row.upTo) ?? 0);
  const top = limits.length ? Math.max(...limits) : 0;
  const next = top > 0 ? top * 10 : 200_000;
  const last = rows[rows.length - 1] ?? { upTo: "", rate: "0" };
  return [...rows.slice(0, -1), { upTo: pesosInput(next), rate: last.rate }, { upTo: "", rate: last.rate }];
}

/** Without bracket `index`; removing the open last bracket opens the one before it. */
export function withBracketRemoved(rows: BracketDraftRow[], index: number): BracketDraftRow[] {
  if (rows.length <= 1) return rows;
  const next = rows.filter((_, i) => i !== index);
  next[next.length - 1] = { ...next[next.length - 1], upTo: "" };
  return next;
}

// ---- Words ------------------------------------------------------------------

/** "₱2,000" — whole-peso limits read without centavos. */
export function formatLimit(minor: number): string {
  return minor % 100 === 0 ? formatPhp(minor).replace(/\.00$/, "") : formatPhp(minor);
}

/** "First ₱2,000", "₱2,000 to ₱20,000", "Above ₱20,000", "Every peso". */
export function bracketRange(fromMinor: number, upToMinor: number | null): string {
  if (upToMinor === null) return fromMinor === 0 ? "Every peso" : `Above ${formatLimit(fromMinor)}`;
  if (fromMinor === 0) return `First ${formatLimit(upToMinor)}`;
  return `${formatLimit(fromMinor)} to ${formatLimit(upToMinor)}`;
}

/** "45% to ₱2,000, 25% to ₱20,000, 15% above" — a table in one line. */
export function scheduleSummary(schedule: ServiceFeeSchedule): string {
  if (schedule.version === 1) return `${formatRatePercent(schedule.rateBps)} flat`;
  return schedule.brackets
    .map((band, index) =>
      band.upToMinor === null
        ? index === 0
          ? `${formatRatePercent(band.rateBps)} on every peso`
          : `${formatRatePercent(band.rateBps)} above`
        : `${formatRatePercent(band.rateBps)} to ${formatLimit(band.upToMinor)}`,
    )
    .join(", ");
}

/** The working rows that carry money; brackets the price never reached are left out. */
export function chargedRows(working: ServiceFeeWorkingRow[]): ServiceFeeWorkingRow[] {
  return working.filter((row) => row.taxableMinor > 0);
}

/** "₱2,000.00 × 45%" — one working row. */
export function workingTerm(row: ServiceFeeWorkingRow): string {
  return `${formatPhp(row.taxableMinor)} × ${formatRatePercent(row.rateBps)}`;
}

/** "₱2,000.00 × 45% + ₱3,000.00 × 25%"; "Nothing to charge" on a ₱0 price. */
export function workingSentence(working: ServiceFeeWorkingRow[]): string {
  const rows = chargedRows(working);
  return rows.length ? rows.map(workingTerm).join(" + ") : "Nothing to charge";
}

/** The fee as a share of the whole shop price, to one decimal: "33%", "19.8%". */
export function effectiveRate(principalMinor: number, feeMinor: number): string {
  if (principalMinor <= 0) return "—";
  const tenths = Math.round((feeMinor * 1_000) / principalMinor);
  return `${(tenths / 10).toLocaleString("en-PH", { maximumFractionDigits: 1 })}%`;
}

/**
 * How an order's fee was priced, for the money panel:
 * - `brackets`: a version-2 snapshot with its working.
 * - `flat`: a legacy flat-rate order (one rate on the whole shop price).
 * - `unknown`: an API that sent neither.
 */
export type OrderFeeBasis =
  | { kind: "brackets"; schedule: ServiceFeeScheduleV2; working: ServiceFeeWorkingRow[] }
  | { kind: "flat"; rateBps: number }
  | { kind: "unknown" };

export function orderFeeBasis(order: OrderFeeLike): OrderFeeBasis {
  const schedule = order.serviceFeeSchedule;
  if (schedule?.version === 2) {
    const working =
      order.serviceFeeWorking ??
      (order.supplierSubtotalMinor != null
        ? serviceFeeFor(order.supplierSubtotalMinor, schedule).serviceFeeWorking
        : []);
    return { kind: "brackets", schedule, working };
  }
  if (schedule?.version === 1) return { kind: "flat", rateBps: schedule.rateBps };
  if (order.serviceFeeRateBps != null) return { kind: "flat", rateBps: order.serviceFeeRateBps };
  return { kind: "unknown" };
}

// ---- When it starts ---------------------------------------------------------

/** Manila is UTC+8 all year, which is what the API's timezone check needs. */
const MANILA_OFFSET = "+08:00";

/**
 * A Manila date and time from `<input type="date">` and `<input type="time">`
 * as the ISO timestamp the API takes ("2026-12-01T00:00:00+08:00"), or null.
 */
export function manilaStart(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const iso = `${date}T${time}:00${MANILA_OFFSET}`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

/** "1 Dec 2026, 12:00 AM" in Manila. */
export function formatManilaStart(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
}

/** Tomorrow's date in Manila, as a date input reads it: the earliest sensible start. */
export function manilaDateAfter(now: Date, days = 1): string {
  const manila = new Date(now.getTime() + 8 * 3_600_000 + days * 86_400_000);
  return manila.toISOString().slice(0, 10);
}

/** Why a start cannot be saved, or null. The API refuses a start in the past. */
export function startProblem(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return "Pick the date and time the new table starts, in Manila time.";
  if (Date.parse(iso) <= now.getTime()) {
    return "That time has passed. Pick a later one, or start as soon as it is saved.";
  }
  return null;
}

/** Each preview row: one shop price under the table in force and under the draft. */
export type PreviewRow = {
  shopPriceMinor: number;
  previous: ServiceFeeResult;
  next: ServiceFeeResult;
};

/** The six prices under two tables, worked out here (read-only and scheduled views). */
export function localPreview(previous: ServiceFeeSchedule, next: ServiceFeeSchedule): PreviewRow[] {
  return PREVIEW_PRICES_MINOR.map((shopPriceMinor) => ({
    shopPriceMinor,
    previous: serviceFeeFor(shopPriceMinor, previous),
    next: serviceFeeFor(shopPriceMinor, next),
  }));
}

/** "+₱120.00", "−₱75.00" or "No change". */
export function feeChange(previousMinor: number, nextMinor: number): string {
  const delta = nextMinor - previousMinor;
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : "−"}${formatPhp(Math.abs(delta))}`;
}
