/**
 * "How long does this take?": the one production-time question a shop answers
 * per listing (gridgo-api#292, release 2).
 *
 * Contract: "Release 2: one production-time question" in
 * `gridgo-api/docs/SCHEDULING_API.md`. A listing reads and writes one
 * `productionTime` object, either Same day (exact hours) or Days (from X to Y
 * working days). The API maps it onto the older `turnaround*` fields; this
 * screen never writes those alongside it, and never sends `express`.
 *
 * The preview (`GET /me/catalog-items/:id/production-time-preview`) is the
 * release-1 deadline calendar for this listing alone: the dates a client
 * would be offered, Tight, Secured or Rush, with ready-by times. It is
 * advisory; it reserves nothing.
 *
 * Pure functions: no React, no fetch.
 */

import { formatPhp } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import {
  DEFAULT_DAY_MINUTES,
  PRODUCTION_DAYS,
  SAME_DAY_STEP_MINUTES,
  sameDay,
  sameDayMaxMinutes,
  timeLabel,
  workingDays,
  type ProductionTime,
} from "@/lib/production-time";

export type ProductionTimeChoice =
  | { mode: "same_day"; hours: number }
  | { mode: "days"; minDays: number; maxDays: number };

export type ProductionTimeMode = ProductionTimeChoice["mode"];

export type ProductionTimeReviewReason = "legacy_one_working_day" | "express_missing_hours";

export type ProductionTimeReview = {
  required: boolean;
  reasons: ProductionTimeReviewReason[];
};

/** The reminder's title, word for word as the shop app shows it. */
export const PRODUCTION_TIME_REVIEW_TITLE = "Check your production time";

/** Where a Same day choice starts, and a Days choice. */
export const DEFAULT_SAME_DAY_HOURS = 2;
export const DEFAULT_DAYS = { minDays: 1, maxDays: 3 } as const;

/** How many days the preview shows. */
export const PREVIEW_DAYS = 14;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function whole(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The listing's choice. `undefined` when the API predates the field (the old
 * duration fields still explain the listing); `null` when the listing has no
 * usable production time yet.
 */
export function readProductionTimeChoice(
  raw: Raw,
): ProductionTimeChoice | null | undefined {
  if (!("productionTime" in raw)) return undefined;
  const value = raw.productionTime;
  if (!isRecord(value)) return null;
  if (value.mode === "same_day") {
    const hours = value.hours;
    return typeof hours === "number" && Number.isFinite(hours) && hours > 0
      ? { mode: "same_day", hours }
      : null;
  }
  if (value.mode === "days") {
    const minDays = whole(value.minDays);
    const maxDays = whole(value.maxDays);
    return minDays != null && maxDays != null && minDays <= maxDays
      ? { mode: "days", minDays, maxDays }
      : null;
  }
  return null;
}

const REVIEW_REASONS: readonly ProductionTimeReviewReason[] = [
  "legacy_one_working_day",
  "express_missing_hours",
];

/** The reminder. Null on an API without it, so nothing is said. */
export function readProductionTimeReview(raw: Raw): ProductionTimeReview | null {
  const value = raw.productionTimeReview;
  if (!isRecord(value)) return null;
  const reasons = Array.isArray(value.reasons)
    ? value.reasons.filter((reason): reason is ProductionTimeReviewReason =>
        REVIEW_REASONS.includes(reason as ProductionTimeReviewReason),
      )
    : [];
  return { required: value.required === true, reasons };
}

/**
 * The choice an older listing would have, from its own duration fields, for
 * an API that does not send `productionTime` yet.
 */
export function choiceFromTimes(
  min: ProductionTime | null,
  max: ProductionTime | null,
): ProductionTimeChoice | null {
  if (!max) return null;
  if (max.unit === "hours") return { mode: "same_day", hours: max.minutes / 60 };
  const low = min?.unit === "days" && min.days <= max.days ? min.days : max.days;
  return { mode: "days", minDays: low, maxDays: max.days };
}

/** The same choice as the duration pair the rest of the portal reads. */
export function choiceTimes(choice: ProductionTimeChoice): {
  min: ProductionTime;
  max: ProductionTime;
} {
  if (choice.mode === "same_day") {
    const time = sameDay(Math.round(choice.hours * 60));
    return { min: time, max: time };
  }
  return { min: workingDays(choice.minDays), max: workingDays(choice.maxDays) };
}

export function sameChoice(
  left: ProductionTimeChoice | null | undefined,
  right: ProductionTimeChoice | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

// ---------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------

/**
 * Switching the answer lands where the shop last was on that side, or on the
 * side's starting point: 2 hours, or 1 to 3 working days.
 */
export function startChoice(mode: ProductionTimeMode): ProductionTimeChoice {
  return mode === "same_day"
    ? { mode, hours: DEFAULT_SAME_DAY_HOURS }
    : { mode, ...DEFAULT_DAYS };
}

/** The half-hour steps a Same day listing offers, up to the last inside one working day. */
export function sameDayHourSteps(
  dayMinutes: number = DEFAULT_DAY_MINUTES,
  current?: number,
): number[] {
  const steps: number[] = [];
  for (
    let minutes = SAME_DAY_STEP_MINUTES;
    minutes <= sameDayMaxMinutes(dayMinutes);
    minutes += SAME_DAY_STEP_MINUTES
  ) {
    steps.push(minutes / 60);
  }
  // An odd time the listing already holds is shown exactly, in its place.
  if (current != null && !steps.includes(current)) {
    steps.push(current);
    steps.sort((left, right) => left - right);
  }
  return steps;
}

/** Days steps: the soonest pulls the latest along, and the latest pushes the soonest back. */
export function withDays(
  choice: { minDays: number; maxDays: number },
  end: "min" | "max",
  value: number,
): Extract<ProductionTimeChoice, { mode: "days" }> {
  const next = Math.min(PRODUCTION_DAYS.max, Math.max(PRODUCTION_DAYS.min, value));
  if (end === "min") {
    return { mode: "days", minDays: next, maxDays: Math.max(next, choice.maxDays) };
  }
  return { mode: "days", minDays: Math.min(next, choice.minDays), maxDays: next };
}

/**
 * Why a choice cannot be saved, in the shop's words. Null when it can. The
 * messages are the shop app's (`gridgo-supplier/lib/productionDays.ts`), so the
 * same bad input reads the same on both.
 */
export function choiceProblem(
  choice: ProductionTimeChoice,
  dayMinutes: number = DEFAULT_DAY_MINUTES,
): string | null {
  if (choice.mode === "same_day") {
    const minutes = choice.hours * 60;
    if (!(minutes > 0) || !Number.isInteger(minutes)) {
      return "Choose how many hours this takes.";
    }
    if (minutes >= dayMinutes) {
      return `Hours are for work done inside one working day (under ${timeLabel(sameDay(dayMinutes))}). Use working days for anything longer.`;
    }
    return null;
  }
  if (
    !Number.isInteger(choice.minDays) ||
    !Number.isInteger(choice.maxDays) ||
    choice.minDays < PRODUCTION_DAYS.min
  ) {
    return "Production time is at least 1 working day.";
  }
  if (choice.maxDays > PRODUCTION_DAYS.max) {
    return `Production time is at most ${PRODUCTION_DAYS.max} working days.`;
  }
  if (choice.minDays > choice.maxDays) {
    return "The soonest can't be later than the latest.";
  }
  return null;
}

/** The query the preview takes for a choice. */
export function previewParams(
  choice: ProductionTimeChoice,
  days: number = PREVIEW_DAYS,
): URLSearchParams {
  const params = new URLSearchParams({ mode: choice.mode });
  if (choice.mode === "same_day") params.set("hours", String(choice.hours));
  else {
    params.set("minDays", String(choice.minDays));
    params.set("maxDays", String(choice.maxDays));
  }
  params.set("days", String(days));
  return params;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function hoursWord(hours: number): string {
  return timeLabel(sameDay(Math.round(hours * 60)));
}

/** "Same day, ready in 2 hours" or "1 to 3 working days". */
export function choiceLine(choice: ProductionTimeChoice | null | undefined): string {
  if (!choice) return "Not set yet";
  if (choice.mode === "same_day") return `Same day, ready in ${hoursWord(choice.hours)}`;
  if (choice.minDays === choice.maxDays) return timeLabel(workingDays(choice.maxDays));
  return `${choice.minDays} to ${choice.maxDays} working days`;
}

/** The figure a Same day stepper shows: "1½" + "hours". */
export function hoursParts(hours: number): { value: string; unit: string } {
  const label = hoursWord(hours);
  const space = label.indexOf(" ");
  return { value: label.slice(0, space), unit: label.slice(space + 1) };
}

/** A same-day time held from before, longer than a working day. */
export function sameDayTooLong(
  choice: ProductionTimeChoice | null | undefined,
  dayMinutes: number = DEFAULT_DAY_MINUTES,
): boolean {
  return choice?.mode === "same_day" && choice.hours * 60 >= dayMinutes;
}

/** What the reminder asks of the shop, one line per reason. */
export function reviewReasonLine(reason: ProductionTimeReviewReason): string {
  return reason === "express_missing_hours"
    ? "This was an Express listing with no production time. Express is now Same day: say how many hours it takes."
    : "GRIDGO rounded this listing up to 1 working day on 7 Oct. Confirm it, or set the time it really takes.";
}

/** The same reasons as Operations reads them. */
export function reviewReasonStaffLine(reason: ProductionTimeReviewReason): string {
  return reason === "express_missing_hours"
    ? "Express with no hours"
    : "Rounded up to 1 working day on 7 Oct";
}

// ---------------------------------------------------------------------------
// The preview
// ---------------------------------------------------------------------------

export type PreviewDayStatus = "not_possible" | "tight" | "secured" | "rush";

export type PreviewDay = {
  /** Manila date, `YYYY-MM-DD`. */
  day: string;
  status: PreviewDayStatus;
  reason: string | null;
  readyBy: string | null;
  /** The faster listed tier a Rush date needs, at the shop's own price. */
  rushTier: { label: string; priceMinor: number | null; surchargeMinor: number | null } | null;
};

export type ProductionTimePreview = {
  days: PreviewDay[];
  earliestReadyBy: string | null;
  securedReadyBy: string | null;
};

const DAY_STATUSES: readonly PreviewDayStatus[] = ["not_possible", "tight", "secured", "rush"];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRushTier(value: unknown): PreviewDay["rushTier"] {
  if (!isRecord(value)) return null;
  return {
    label: text(value.label) ?? "Faster option",
    // The shop's own tier price. The `client*` figures carry GRIDGO's markup,
    // which a shop never sees.
    priceMinor: money(value.priceMinor),
    surchargeMinor: money(value.surchargeMinor),
  };
}

export function normalizePreview(body: unknown): ProductionTimePreview {
  const raw = isRecord(body) ? body : {};
  const calendar = isRecord(raw.calendar) ? raw.calendar : {};
  const scheduling = isRecord(raw.scheduling) ? raw.scheduling : {};
  const days = Array.isArray(calendar.days)
    ? calendar.days.flatMap((entry): PreviewDay[] => {
        if (!isRecord(entry)) return [];
        const day = text(entry.day);
        const status = DAY_STATUSES.includes(entry.status as PreviewDayStatus)
          ? (entry.status as PreviewDayStatus)
          : null;
        if (!day || !status) return [];
        return [
          {
            day,
            status,
            reason: text(entry.reason),
            readyBy: status === "not_possible" ? null : text(entry.readyBy),
            rushTier: status === "rush" ? readRushTier(entry.rushTier) : null,
          },
        ];
      })
    : [];
  return {
    days,
    earliestReadyBy: text(scheduling.earliestReadyBy) ?? text(calendar.earliest),
    securedReadyBy: text(scheduling.securedReadyBy),
  };
}

const NOT_POSSIBLE_REASONS: Record<string, string> = {
  gridgo_closed_sunday: "GRIDGO is closed on Sundays",
  gridgo_closed: "GRIDGO is closed",
  outside_operating_hours: "Outside GRIDGO's hours",
  after_dispatch_cutoff: "After the dispatch cutoff",
  before_shortest_time: "Sooner than your shortest time",
  no_eligible_listing: "Not offered",
};

export type PreviewDayPresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** What else the client reads on that date. */
  detail: string | null;
};

/** One date as a status a shop can read in greyscale, with what the client sees beside it. */
export function presentPreviewDay(day: PreviewDay): PreviewDayPresentation {
  if (day.status === "not_possible") {
    return {
      label: "Not offered",
      tone: "neutral",
      icon: "ban",
      detail: (day.reason && NOT_POSSIBLE_REASONS[day.reason]) || "Not offered",
    };
  }
  const ready = day.readyBy ? `Ready by ${manilaDateTime(day.readyBy)}` : null;
  if (day.status === "rush") {
    const tier = day.rushTier;
    const price = tier
      ? tier.priceMinor != null
        ? ` at ${formatPhp(tier.priceMinor)}`
        : tier.surchargeMinor != null
          ? `, ${formatPhp(tier.surchargeMinor)} more`
          : ""
      : "";
    return {
      label: "Rush, costs more",
      tone: "warning",
      icon: "zap",
      detail: [tier ? `Your ${tier.label} option${price}` : null, ready]
        .filter(Boolean)
        .join(". "),
    };
  }
  if (day.status === "tight") {
    return { label: "Tight", tone: "warning", icon: "clock", detail: ready };
  }
  return { label: "Secured", tone: "success", icon: "circle-check", detail: ready };
}

const MANILA_OFFSET_MS = 8 * 60 * 60_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 22 Oct" for a Manila `YYYY-MM-DD`. */
export function manilaDayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const at = new Date(Date.UTC(year, (month || 1) - 1, date || 1));
  if (Number.isNaN(at.getTime())) return day;
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

/** "Thu 22 Oct, 11:45 AM" on the Manila clock. */
export function manilaDateTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const wall = new Date(at.getTime() + MANILA_OFFSET_MS);
  const hours = wall.getUTCHours();
  const minutes = String(wall.getUTCMinutes()).padStart(2, "0");
  const clock = `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
  return `${WEEKDAYS[wall.getUTCDay()]} ${wall.getUTCDate()} ${MONTHS[wall.getUTCMonth()]}, ${clock}`;
}

/** The summary over the dates: the soonest a client can have it, and when it is secured. */
export function previewSummary(
  choice: ProductionTimeChoice,
  preview: ProductionTimePreview,
): string {
  const earliest = preview.earliestReadyBy;
  if (!earliest) return "No date in the next two weeks can be offered yet.";
  const soonest = `If a client orders now, the soonest it can be ready is ${manilaDateTime(earliest)}.`;
  const secured = preview.securedReadyBy;
  if (choice.mode === "same_day" || !secured || secured === earliest) return soonest;
  return `${soonest} Dates from ${manilaDateTime(secured)} are Secured.`;
}

// ---------------------------------------------------------------------------
// Use for all my listings
// ---------------------------------------------------------------------------

/** Every own listing with its version, as the bulk apply's handshake takes them. */
export function expectedVersionsOf(
  listings: ReadonlyArray<{ id: string; version: number | null }>,
): Record<string, number> | null {
  const versions: Record<string, number> = {};
  for (const listing of listings) {
    if (listing.version == null) return null;
    versions[listing.id] = listing.version;
  }
  return versions;
}
