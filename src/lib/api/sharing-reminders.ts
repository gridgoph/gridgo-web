/**
 * Share taps and rider handoff reminders (contract "Order sharing and rider
 * handoff reminders" in gridgo-api, gridgo-client#341 and gridgo-rider#157).
 *
 * `GET /ops/mission-shares` counts each client's Share and "Send to a friend"
 * taps; `GET /ops/delivery-reminders` groups door deliveries by rider and
 * Asia/Manila week with what the reminded clients did next. Both are
 * Operations and Super Admin only, paged by `offset`/`limit` (≤ 500) with a
 * `total`, and filtered by `from` (inclusive) / `to` (exclusive). An order
 * carries the rider's own record as `deliveryReminder`, with any package
 * photo in `deliveryPackagePhotoFileIds`.
 *
 * This is the only file that knows these field names. Everything raw is read
 * into the shapes below, so a rename on the API side is a change here and
 * nowhere else. A tap is an attempt to open the share sheet, not a post, and
 * nothing here pays anyone: rider pay and rewards are unchanged.
 */

import { apiRequest, isApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

export type ShareTapCounts = {
  clientId: string;
  shareTaps: number;
  sendToFriendTaps: number;
};

/** One rider's door deliveries in one Manila week. */
export type ReminderWeek = {
  riderId: string;
  /** ISO week, `2026-W44`. */
  week: string;
  /** The Monday, `2026-10-26`, as a Manila calendar date. */
  weekStart: string;
  deliveries: number;
  remindedDeliveries: number;
  /** Older rider app or history: in `deliveries`, never reminded. */
  legacyDeliveries: number;
  surveySubmittedDeliveries: number;
  shareTappedDeliveries: number;
  surveyAndShareDeliveries: number;
};

/** What the rider recorded at the door. Immutable once the delivery is done. */
export type DeliveryReminder = {
  /** 0 is an older rider app: no reminder step, never read as a skipped one. */
  protocolVersion: number;
  remindedClient: boolean;
  clientAgreedToPhoto: boolean;
  packagePhotoFileId: string | null;
  deliveredAt: string | null;
};

// ---------------------------------------------------------------------------
// Reading the API's JSON
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The response is not a report this screen can trust. */
export class SharingReportShapeError extends Error {
  constructor() {
    super("sharing_report_unreadable");
  }
}

type Page<T> = { total: number; rows: T[] };

function readPage<T>(raw: unknown, key: string, read: (row: Raw) => T | null): Page<T> {
  const body = obj(raw);
  if (!Array.isArray(body[key]) || typeof body.total !== "number") {
    throw new SharingReportShapeError();
  }
  const rows = (body[key] as unknown[]).map((row) => read(obj(row)));
  return { total: count(body.total), rows: rows.filter((row): row is T => row !== null) };
}

export function readShareTapCounts(row: Raw): ShareTapCounts | null {
  const clientId = text(row.clientId);
  if (!clientId) return null;
  return {
    clientId,
    shareTaps: count(row.shareTaps),
    sendToFriendTaps: count(row.sendToFriendTaps),
  };
}

export function readReminderWeek(row: Raw): ReminderWeek | null {
  const riderId = text(row.riderId);
  const weekStart = text(row.weekStart);
  if (!riderId || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;
  const deliveries = count(row.deliveries);
  // Every follow-through count is a subset of the one before it; clamp so a
  // bad row can never draw a rate above 100%.
  const reminded = Math.min(count(row.remindedDeliveries), deliveries);
  const surveyed = Math.min(count(row.surveySubmittedDeliveries), reminded);
  const shared = Math.min(count(row.shareTappedDeliveries), reminded);
  return {
    riderId,
    week: text(row.week) ?? manilaWeekOf(`${weekStart}T00:00:00+08:00`).week,
    weekStart,
    deliveries,
    remindedDeliveries: reminded,
    legacyDeliveries: Math.min(count(row.legacyDeliveries), deliveries - reminded),
    surveySubmittedDeliveries: surveyed,
    shareTappedDeliveries: shared,
    surveyAndShareDeliveries: Math.min(count(row.surveyAndShareDeliveries), surveyed, shared),
  };
}

/** The order's reminder record, or null when the API sent none. */
export function deliveryReminderOf(
  order: Pick<Order, "deliveryReminder">,
): DeliveryReminder | null {
  if (!order.deliveryReminder || typeof order.deliveryReminder !== "object") return null;
  const raw = obj(order.deliveryReminder);
  const version = typeof raw.protocolVersion === "number" ? raw.protocolVersion : 0;
  return {
    protocolVersion: version,
    remindedClient: raw.remindedClient === true,
    clientAgreedToPhoto: raw.clientAgreedToPhoto === true,
    packagePhotoFileId: text(raw.packagePhotoFileId),
    deliveredAt: text(raw.deliveredAt),
  };
}

/** Package photo ids on the order, the reminder's own first, without repeats. */
export function packagePhotoIdsOf(
  order: Pick<Order, "deliveryReminder" | "deliveryPackagePhotoFileIds">,
): string[] {
  const ids = [
    deliveryReminderOf(order)?.packagePhotoFileId,
    ...(Array.isArray(order.deliveryPackagePhotoFileIds)
      ? order.deliveryPackagePhotoFileIds
      : []),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))];
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** The API's largest page; reports are read in pages of this to the end. */
export const REPORT_PAGE = 500;
/** A runaway guard: 50 pages is 25,000 rows, far past any real report. */
const MAX_PAGES = 50;

export type ReportRange = { from?: string; to?: string };

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}

export async function listMissionShares(
  filter: ReportRange & { clientId?: string; offset?: number; limit?: number } = {},
): Promise<Page<ShareTapCounts>> {
  const raw = await apiRequest<unknown>(
    `/ops/mission-shares${query({ ...filter, offset: filter.offset ?? 0, limit: filter.limit ?? REPORT_PAGE })}`,
  );
  return readPage(raw, "clients", readShareTapCounts);
}

export async function listDeliveryReminders(
  filter: ReportRange & { riderId?: string; offset?: number; limit?: number } = {},
): Promise<Page<ReminderWeek>> {
  const raw = await apiRequest<unknown>(
    `/ops/delivery-reminders${query({ ...filter, offset: filter.offset ?? 0, limit: filter.limit ?? REPORT_PAGE })}`,
  );
  return readPage(raw, "weeks", readReminderWeek);
}

async function readAll<T>(
  read: (offset: number) => Promise<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const next = await read(rows.length);
    rows.push(...next.rows);
    if (!next.rows.length || rows.length >= next.total) break;
  }
  return rows;
}

/**
 * Every client's tap counts, all time, keyed by client id. The endpoint has
 * no list-of-ids filter, so the whole report is read once rather than one
 * request per client on the page.
 */
export async function readAllShareTaps(
  range: ReportRange = {},
): Promise<Map<string, ShareTapCounts>> {
  const rows = await readAll((offset) => listMissionShares({ ...range, offset }));
  return new Map(rows.map((row) => [row.clientId, row]));
}

/** Every rider-week row for deliveries inside `range`. */
export async function readAllReminderWeeks(range: ReportRange): Promise<ReminderWeek[]> {
  return readAll((offset) => listDeliveryReminders({ ...range, offset }));
}

/** An API from before this contract answers the route `404 not_found`. */
export function reportNotOnApi(err: unknown): boolean {
  return isApiError(err) && err.status === 404;
}

// ---------------------------------------------------------------------------
// Asia/Manila weeks
// ---------------------------------------------------------------------------

/** Manila is UTC+08:00 all year, as the API assumes. */
const MANILA_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;

/** The Manila Monday and ISO week (`2026-W44`) holding `at`. */
export function manilaWeekOf(at: string | number | Date): { week: string; weekStart: string } {
  const local = new Date(new Date(at).getTime() + MANILA_OFFSET_MS);
  const day = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() || 7) + 1);
  const weekStart = day.toISOString().slice(0, 10);
  const thursday = new Date(day.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(
    ((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7,
  );
  return { week: `${year}-W${String(week).padStart(2, "0")}`, weekStart };
}

/** A `YYYY-MM-DD` Monday from the address bar, or null. */
export function readWeekStart(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  return manilaWeekOf(at - MANILA_OFFSET_MS).weekStart === value ? value : null;
}

/** The Monday `weeks` after (or before, when negative) `weekStart`. */
export function shiftWeek(weekStart: string, weeks: number): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) + weeks * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Whole weeks from `earlier` to `later` (both Mondays). */
export function weeksBetween(earlier: string, later: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / (7 * DAY_MS),
  );
}

/** `from`/`to` instants for the Manila weeks `firstWeekStart` through `lastWeekStart`. */
export function weeksRange(firstWeekStart: string, lastWeekStart: string): Required<ReportRange> {
  const from = Date.parse(`${firstWeekStart}T00:00:00Z`) - MANILA_OFFSET_MS;
  const to = Date.parse(`${shiftWeek(lastWeekStart, 1)}T00:00:00Z`) - MANILA_OFFSET_MS;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

const DAY_MONTH = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `Oct 26 – Nov 1, 2026`: the Monday to Sunday the week covers. */
export function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return `${DAY_MONTH.format(start)} – ${DAY_MONTH_YEAR.format(end)}`;
}

/** `Oct 26`, for the week strip. */
export function weekShortLabel(weekStart: string): string {
  return DAY_MONTH.format(new Date(`${weekStart}T00:00:00Z`));
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/** Whole percent, or null when there is nothing to divide by. */
export function ratePercent(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.round((Math.min(part, whole) / whole) * 100);
}

/** `75%`, or `—` with no deliveries. Never `NaN%`. */
export function formatRate(part: number, whole: number): string {
  const percent = ratePercent(part, whole);
  return percent === null ? "—" : `${percent}%`;
}

export type ReminderTotals = Omit<ReminderWeek, "riderId" | "week" | "weekStart"> & {
  riders: number;
};

export function sumReminderWeeks(rows: readonly ReminderWeek[]): ReminderTotals {
  const totals: ReminderTotals = {
    riders: new Set(rows.map((row) => row.riderId)).size,
    deliveries: 0,
    remindedDeliveries: 0,
    legacyDeliveries: 0,
    surveySubmittedDeliveries: 0,
    shareTappedDeliveries: 0,
    surveyAndShareDeliveries: 0,
  };
  for (const row of rows) {
    totals.deliveries += row.deliveries;
    totals.remindedDeliveries += row.remindedDeliveries;
    totals.legacyDeliveries += row.legacyDeliveries;
    totals.surveySubmittedDeliveries += row.surveySubmittedDeliveries;
    totals.shareTappedDeliveries += row.shareTappedDeliveries;
    totals.surveyAndShareDeliveries += row.surveyAndShareDeliveries;
  }
  return totals;
}
