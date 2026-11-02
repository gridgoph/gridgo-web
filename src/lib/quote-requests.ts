/**
 * Quote requests: custom signage and 3D printing (gridgo-api#226).
 *
 * Contract: `gridgo-api/docs/QUOTE_REQUESTS_API.md`. A client sends a brief
 * with reference files; Operations asks suitable shops for a price outside
 * the app and records each reply here, then publishes one to three replies
 * (one per shop) as anonymous options A, B and C. The client accepts one and
 * the order continues as any other, through an ordinary cart.
 *
 * Pure on purpose: types, words, the reply form's checks, the publish rules
 * and the client preview. No React, no fetch.
 */

import { formatDate, formatPhp, pesosToMinor } from "@/lib/format";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import {
  choiceLine,
  choiceProblem,
  readProductionTimeChoice,
  type ProductionTimeChoice,
} from "@/lib/production-time-choice";

// ---------------------------------------------------------------------------
// Shapes (the Operations projection of GET /ops/quote-requests[/:id])
// ---------------------------------------------------------------------------

export type QuoteStatus =
  | "requested"
  | "quoting"
  | "published"
  | "accepted"
  | "ordered"
  | "expired"
  | "cancelled";

export type QuoteEventFit = "before" | "after" | null;

export type QuoteEventDateWarningCode =
  | "event_date_passed"
  | "no_option_before_event"
  | "event_date_soon";

export type QuoteEventDateWarning = { code: QuoteEventDateWarningCode | string; message?: string };

/** The matching factors a client ranks, in the API's words. */
export type QuoteRankFactor = "quality" | "speed" | "cost" | "distance";

export type QuoteReply = {
  id: string;
  status: "active" | "withdrawn";
  version: number;
  supplierId: string;
  shopName: string | null;
  supplierServiceId?: string | null;
  /** The shop's own price for the whole job. */
  priceMinor: number;
  /** Shop price plus GRIDGO's service fee, as the client would see it. */
  clientPriceMinor: number | null;
  productionTime: ProductionTimeChoice | null;
  readyBy: string | null;
  eventDateFit: QuoteEventFit;
  recommendedOptions: string;
  note: string;
  /** "A", "B" or "C" while this reply is a published option. */
  publishedLabel: string | null;
  enteredBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteOption = {
  label: string;
  rank: number;
  clientPriceMinor: number;
  productionTime: ProductionTimeChoice | null;
  readyBy: string | null;
  eventDateFit: QuoteEventFit;
  recommendedOptions: string;
  acceptable: boolean;
  rating?: { average?: number; count?: number } | null;
  // Operations only.
  replyId?: string;
  supplierId?: string;
  shopName?: string | null;
  priceMinor?: number;
  catalogItemId?: string;
};

export type QuoteRequest = {
  id: string;
  status: QuoteStatus;
  version: number;
  productType: string;
  productTypeName: string | null;
  use: string;
  placement: "indoor" | "outdoor";
  size: string;
  quantity: number;
  notes: string;
  budgetMinor: number | null;
  /** Manila calendar day, `YYYY-MM-DD`. Information only; it never blocks. */
  eventDate: string | null;
  referenceFiles: { fileId: string; originalFilename: string | null }[];
  requestFulfillment?: {
    fulfillmentMode?: "delivery" | "pickup";
    dropoff?: { label?: string | null } | null;
  } | null;
  ranking: string[];
  options: QuoteOption[];
  matchReason: { key: string; label: string } | null;
  publishedAt: string | null;
  validUntil: string | null;
  acceptedOption: string | null;
  acceptedAt: string | null;
  cartId: string | null;
  orderId: string | null;
  cancelledAt: string | null;
  /** `client` or `operations`. */
  cancelledBy: string | null;
  cancelReason: string | null;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Operations only.
  client?: { id: string; name: string | null; email: string | null };
  replies?: QuoteReply[];
  eventDateWarning?: QuoteEventDateWarning | null;
};

/** Reads a reply's or option's production time; anything unreadable is null. */
export function quoteProductionTime(value: unknown): ProductionTimeChoice | null {
  return readProductionTimeChoice({ productionTime: value }) ?? null;
}

// ---------------------------------------------------------------------------
// Limits the API enforces
// ---------------------------------------------------------------------------

export const MAX_QUOTE_OPTIONS = 3;
export const QUOTE_OPTION_LABELS = ["A", "B", "C"] as const;
export const QUOTE_TEXT_MAX = 1000;
export const QUOTE_REASON_MAX = 500;
/** `settings.quoteValidityDays`: whole days, 1 to 90, 7 by default. */
export const QUOTE_VALIDITY_DAYS = { min: 1, max: 90, default: 7 } as const;
/** One request's own validity: future, at most 90 days away. */
export const QUOTE_VALIDITY_MAX_DAYS = 90;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

type Presented = { label: string; tone: StatusTone; icon: StatusIconName };

const STATUS: Record<QuoteStatus, Presented> = {
  requested: { label: "New", tone: "warning", icon: "clock" },
  quoting: { label: "Quoting", tone: "info", icon: "square-pen" },
  published: { label: "With the client", tone: "info", icon: "clock" },
  accepted: { label: "Accepted", tone: "success", icon: "circle-check" },
  ordered: { label: "Ordered", tone: "success", icon: "circle-check" },
  expired: { label: "Expired", tone: "neutral", icon: "circle-x" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "ban" },
};

export function presentQuoteStatus(status: string): Presented {
  return STATUS[status as QuoteStatus] ?? { label: "Unknown", tone: "neutral", icon: "circle-help" };
}

/** The queue's filters: the API's own `status` values, plus everything. */
export type QuoteFilter = "open" | QuoteStatus | "all";

export const QUOTE_FILTERS: readonly { id: QuoteFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "requested", label: "New" },
  { id: "quoting", label: "Quoting" },
  { id: "published", label: "With the client" },
  { id: "accepted", label: "Accepted" },
  { id: "ordered", label: "Ordered" },
  { id: "expired", label: "Expired" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const OPEN: ReadonlySet<string> = new Set(["requested", "quoting", "published", "accepted"]);

export function isQuoteFilter(value: string | null | undefined): value is QuoteFilter {
  return QUOTE_FILTERS.some((filter) => filter.id === value);
}

export function matchesQuoteFilter(request: Pick<QuoteRequest, "status">, filter: QuoteFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return OPEN.has(request.status);
  return request.status === filter;
}

/** How many requests each filter holds, from one list. */
export function quoteFilterCounts(
  requests: readonly Pick<QuoteRequest, "status">[],
): Record<QuoteFilter, number> {
  const counts = Object.fromEntries(QUOTE_FILTERS.map((filter) => [filter.id, 0])) as Record<
    QuoteFilter,
    number
  >;
  for (const request of requests) {
    for (const filter of QUOTE_FILTERS) {
      if (matchesQuoteFilter(request, filter.id)) counts[filter.id] += 1;
    }
  }
  return counts;
}

/**
 * Requests waiting on Operations: new briefs and ones with replies not yet
 * published. Published and accepted ones wait on the client.
 */
export function quotesWaitingOnOperations(
  requests: readonly Pick<QuoteRequest, "status">[],
): number {
  return requests.filter((row) => row.status === "requested" || row.status === "quoting").length;
}

export function productTypeLabel(request: Pick<QuoteRequest, "productType" | "productTypeName">): string {
  if (request.productTypeName?.trim()) return request.productTypeName.trim();
  if (request.productType === "business_store_signages") return "Business & store signages";
  if (request.productType === "three_d_printing_scale_models") return "3D printing & scale models";
  return "Custom job";
}

export function placementLabel(placement: string): string {
  return placement === "outdoor" ? "Outdoor" : "Indoor";
}

/** "Ready before the event" when there is an event date and a ready date. */
export function eventFitLabel(fit: QuoteEventFit): string | null {
  if (fit === "before") return "Ready before the event";
  if (fit === "after") return "Ready after the event";
  return null;
}

const WARNING_COPY: Record<QuoteEventDateWarningCode, string> = {
  event_date_passed: "The client's event date has already passed.",
  no_option_before_event:
    "No shop reply so far can be ready before the client's event date. Ask another shop, or tell the client.",
  event_date_soon:
    "The client's event is less than 3 days away and no shop has replied. Custom work may not make it.",
};

/** The event-date warning in plain words. It never blocks anything. */
export function eventDateWarningCopy(warning: QuoteEventDateWarning | null | undefined): string | null {
  if (!warning) return null;
  return (
    WARNING_COPY[warning.code as QuoteEventDateWarningCode] ??
    warning.message ??
    "The client's event date may be hard to meet."
  );
}

/** "15 Nov 2026", read as the Manila calendar day the client chose. */
export function formatEventDate(day: string | null | undefined): string {
  if (!day) return "—";
  return formatDate(`${day}T12:00:00+08:00`);
}

export function productionTimeLine(time: ProductionTimeChoice | null | undefined): string {
  return time ? choiceLine(time) : "Not given";
}

/** What the request waits on, one line. */
export function quoteNextStep(request: QuoteRequest): string {
  const replies = (request.replies ?? []).filter((reply) => reply.status === "active").length;
  switch (request.status) {
    case "requested":
      return "Ask suitable shops for a price, then record each reply.";
    case "quoting":
      return `${replies} ${replies === 1 ? "reply" : "replies"} recorded. Publish 1 to 3 to the client.`;
    case "published":
      return `With the client until ${formatDate(request.validUntil)}.`;
    case "accepted":
      return `The client chose option ${request.acceptedOption ?? "?"}. Checkout continues in their cart.`;
    case "ordered":
      return "The client placed the order.";
    case "expired":
      return request.options.length
        ? "The options lapsed with no order. Renew them or publish again."
        : "The options lapsed with no order.";
    case "cancelled":
      return request.cancelledBy === "client"
        ? "Cancelled by the client."
        : "Cancelled by Operations.";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Reply form
// ---------------------------------------------------------------------------

export type ReplyDraft = {
  supplierId: string;
  price: string;
  mode: ProductionTimeChoice["mode"];
  hours: string;
  minDays: string;
  maxDays: string;
  recommendedOptions: string;
  note: string;
};

export type ReplyField = "supplierId" | "price" | "productionTime" | "recommendedOptions" | "note";

export type ReplyBody = {
  supplierId?: string;
  priceMinor: number;
  productionTime: ProductionTimeChoice;
  recommendedOptions: string;
  note: string;
};

export function emptyReplyDraft(): ReplyDraft {
  return {
    supplierId: "",
    price: "",
    mode: "days",
    hours: "2",
    minDays: "1",
    maxDays: "3",
    recommendedOptions: "",
    note: "",
  };
}

export function replyDraftFrom(reply: QuoteReply): ReplyDraft {
  const time = reply.productionTime;
  const pesos = (reply.priceMinor / 100).toFixed(2);
  return {
    supplierId: reply.supplierId,
    price: pesos,
    mode: time?.mode ?? "days",
    hours: time?.mode === "same_day" ? String(time.hours) : "2",
    minDays: time?.mode === "days" ? String(time.minDays) : "1",
    maxDays: time?.mode === "days" ? String(time.maxDays) : "3",
    recommendedOptions: reply.recommendedOptions ?? "",
    note: reply.note ?? "",
  };
}

function numberOf(text: string): number {
  const trimmed = text.trim();
  return trimmed && /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export function draftProductionTime(draft: ReplyDraft): ProductionTimeChoice {
  return draft.mode === "same_day"
    ? { mode: "same_day", hours: numberOf(draft.hours) }
    : { mode: "days", minDays: numberOf(draft.minDays), maxDays: numberOf(draft.maxDays) };
}

/**
 * The reply form's checks, before the API sees it. A new reply needs a shop;
 * an edit keeps its shop. Returns the body to send, or what to fix per field.
 */
export function readReplyDraft(
  draft: ReplyDraft,
  { editing = false }: { editing?: boolean } = {},
): { ok: true; body: ReplyBody } | { ok: false; errors: Partial<Record<ReplyField, string>> } {
  const errors: Partial<Record<ReplyField, string>> = {};
  if (!editing && !draft.supplierId.trim()) errors.supplierId = "Choose the shop that replied.";
  const priceMinor = pesosToMinor(draft.price);
  if (priceMinor === null || priceMinor <= 0) {
    errors.price = "Enter the shop's price for the whole job, in pesos, above ₱0.";
  }
  const productionTime = draftProductionTime(draft);
  const timeProblem =
    productionTime.mode === "same_day" && !(productionTime.hours > 0)
      ? "Enter how many hours this takes."
      : choiceProblem(productionTime);
  if (timeProblem) errors.productionTime = timeProblem;
  if (draft.recommendedOptions.trim().length > QUOTE_TEXT_MAX) {
    errors.recommendedOptions = `Keep it to ${QUOTE_TEXT_MAX.toLocaleString("en-PH")} characters.`;
  }
  if (draft.note.trim().length > QUOTE_TEXT_MAX) {
    errors.note = `Keep it to ${QUOTE_TEXT_MAX.toLocaleString("en-PH")} characters.`;
  }
  if (Object.keys(errors).length || priceMinor === null) return { ok: false, errors };
  return {
    ok: true,
    body: {
      ...(editing ? {} : { supplierId: draft.supplierId.trim() }),
      priceMinor,
      productionTime,
      recommendedOptions: draft.recommendedOptions.trim(),
      note: draft.note.trim(),
    },
  };
}

/** Only what changed, for `PATCH …/replies/:replyId`. Null when nothing did. */
export function replyChanges(
  reply: QuoteReply,
  body: ReplyBody,
): Partial<Omit<ReplyBody, "supplierId">> | null {
  const changes: Partial<Omit<ReplyBody, "supplierId">> = {};
  if (body.priceMinor !== reply.priceMinor) changes.priceMinor = body.priceMinor;
  if (JSON.stringify(body.productionTime) !== JSON.stringify(reply.productionTime)) {
    changes.productionTime = body.productionTime;
  }
  if (body.recommendedOptions !== (reply.recommendedOptions ?? "")) {
    changes.recommendedOptions = body.recommendedOptions;
  }
  if (body.note !== (reply.note ?? "")) changes.note = body.note;
  return Object.keys(changes).length ? changes : null;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/** Replies can change while the client has not accepted. */
export function repliesEditable(status: QuoteStatus): boolean {
  return status === "requested" || status === "quoting" || status === "published" || status === "expired";
}

export function canPublish(status: QuoteStatus): boolean {
  return status === "quoting" || status === "published" || status === "expired";
}

/** Validity can change on a published, accepted, or lapsed request with options. */
export function canChangeValidity(request: Pick<QuoteRequest, "status" | "options">): boolean {
  return (
    request.status === "published" ||
    request.status === "accepted" ||
    (request.status === "expired" && request.options.length > 0)
  );
}

export function canCancel(status: QuoteStatus): boolean {
  return status !== "ordered" && status !== "cancelled";
}

/**
 * Why this choice of replies cannot be published, or null when it can: one to
 * three active replies, at most one per shop.
 */
export function publishProblem(
  replies: readonly QuoteReply[],
  selectedIds: readonly string[],
): string | null {
  if (!selectedIds.length) return "Choose at least one reply to publish.";
  if (selectedIds.length > MAX_QUOTE_OPTIONS) {
    return `Publish at most ${MAX_QUOTE_OPTIONS} options.`;
  }
  const chosen = selectedIds.map((id) => replies.find((reply) => reply.id === id));
  if (chosen.some((reply) => !reply || reply.status !== "active")) {
    return "Only active replies can be published.";
  }
  const seen = new Set<string>();
  for (const reply of chosen as QuoteReply[]) {
    if (seen.has(reply.supplierId)) {
      return `Publish one option per shop. ${reply.shopName ?? "One shop"} is chosen twice.`;
    }
    seen.add(reply.supplierId);
  }
  return null;
}

/**
 * Why this reply cannot be added to the choice right now, or null. A reply
 * already chosen can always be cleared.
 */
export function selectBlocker(
  replies: readonly QuoteReply[],
  selectedIds: readonly string[],
  reply: QuoteReply,
): string | null {
  if (selectedIds.includes(reply.id)) return null;
  if (reply.status !== "active") return "Withdrawn";
  if (selectedIds.length >= MAX_QUOTE_OPTIONS) return `${MAX_QUOTE_OPTIONS} options chosen`;
  const sameShop = selectedIds.some(
    (id) => replies.find((row) => row.id === id)?.supplierId === reply.supplierId,
  );
  return sameShop ? "This shop is already chosen" : null;
}

export const FACTOR_WORDS: Record<QuoteRankFactor, string> = {
  quality: "quality",
  speed: "speed",
  cost: "price",
  distance: "distance",
};

export function rankingLine(ranking: readonly string[]): string {
  const words = ranking
    .map((factor) => FACTOR_WORDS[factor as QuoteRankFactor])
    .filter(Boolean);
  return words.length ? words.join(", then ") : "the client's priority";
}

export type PreviewOption = {
  label: string;
  replyId: string;
  clientPriceMinor: number | null;
  productionTime: ProductionTimeChoice | null;
  readyBy: string | null;
  eventDateFit: QuoteEventFit;
  recommendedOptions: string;
};

/**
 * How the chosen replies would reach the client: lettered A, B, C with no
 * shop name, ordered by the client's priority as far as the portal can
 * tell. Price and speed are known here; quality and distance are scored by
 * the API at publish, so a tie on those keeps the order they were chosen in.
 * `exact` is false when the API may letter them differently.
 */
export function previewOptions(
  replies: readonly QuoteReply[],
  selectedIds: readonly string[],
  ranking: readonly string[],
): { options: PreviewOption[]; exact: boolean } {
  const chosen = selectedIds
    .map((id) => replies.find((reply) => reply.id === id))
    .filter((reply): reply is QuoteReply => Boolean(reply));
  const known = ranking.filter((factor) => factor === "cost" || factor === "speed");
  const first = ranking[0];
  const exact = chosen.length <= 1 || first === "cost" || first === "speed";
  const value = (reply: QuoteReply, factor: string) =>
    factor === "cost"
      ? (reply.clientPriceMinor ?? Number.POSITIVE_INFINITY)
      : reply.readyBy
        ? Math.floor(Date.parse(reply.readyBy) / 3_600_000)
        : Number.POSITIVE_INFINITY;
  const sorted = exact
    ? [...chosen].sort((a, b) => {
        for (const factor of known) {
          const diff = value(a, factor) - value(b, factor);
          if (diff) return diff;
        }
        return 0;
      })
    : chosen;
  return {
    exact,
    options: sorted.map((reply, index) => ({
      label: QUOTE_OPTION_LABELS[index] ?? String(index + 1),
      replyId: reply.id,
      clientPriceMinor: reply.clientPriceMinor,
      productionTime: reply.productionTime,
      readyBy: reply.readyBy,
      eventDateFit: reply.eventDateFit,
      recommendedOptions: reply.recommendedOptions,
    })),
  };
}

// ---------------------------------------------------------------------------
// Validity
// ---------------------------------------------------------------------------

/** The setting as typed: whole days 1–90, or null. */
export function parseValidityDays(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= QUOTE_VALIDITY_DAYS.min && days <= QUOTE_VALIDITY_DAYS.max ? days : null;
}

/** The setting in force; the API's default when it is missing or out of range. */
export function validityDaysInForce(value: unknown): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= QUOTE_VALIDITY_DAYS.min &&
    value <= QUOTE_VALIDITY_DAYS.max
    ? value
    : QUOTE_VALIDITY_DAYS.default;
}

/**
 * A new end for one request's validity, from a `YYYY-MM-DD` Manila day: the
 * end of that day. Why it cannot be used, or the ISO time to send.
 */
export function validityUntilFromDay(
  day: string,
  now: number = Date.now(),
): { ok: true; validUntil: string } | { ok: false; problem: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, problem: "Choose a date." };
  const end = Date.parse(`${day}T23:59:00+08:00`);
  if (!Number.isFinite(end)) return { ok: false, problem: "Choose a date." };
  if (end <= now) return { ok: false, problem: "Choose a date after today." };
  if (end - now > QUOTE_VALIDITY_MAX_DAYS * DAY_MS) {
    return { ok: false, problem: `Choose a date at most ${QUOTE_VALIDITY_MAX_DAYS} days away.` };
  }
  return { ok: true, validUntil: new Date(end).toISOString() };
}

/** Today in Manila as `YYYY-MM-DD`. */
export function manilaDay(at: number = Date.now()): string {
  return new Date(at + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` in Manila for an ISO time. */
export function manilaDayOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  return Number.isFinite(at) ? manilaDay(at) : "";
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const BLOCKER_WORDS: Record<string, string> = {
  account_inactive: "its account is suspended",
  supplier_profile: "it has no shop details",
  shop_closed: "it is closed for now",
  shop_location: "it has no shop location",
  supplier_membership: "it is not a shop account",
  supplier_not_approved: "it is not approved",
  service_not_live: "it has no live service line",
  production_day_length_unavailable: "its opening hours differ from day to day",
  shop_never_open: "it has no open production days ahead",
};

/** Plain words for the API's quote refusals. Null leaves it to the caller's fallback. */
export function quoteErrorCopy(code: string, details?: Record<string, unknown>): string | null {
  switch (code) {
    case "quote_shop_unavailable": {
      const blockers = Array.isArray(details?.blockers)
        ? (details.blockers as unknown[])
            .map((blocker) => BLOCKER_WORDS[String(blocker)])
            .filter(Boolean)
        : [];
      return blockers.length
        ? `That shop cannot take this job: ${blockers.join(", ")}.`
        : "That shop cannot take GRIDGO work right now.";
    }
    case "supplier_not_found":
      return "That shop no longer exists. Choose another.";
    case "quote_request_closed":
      return "This request is closed, so it cannot change. Refresh to see where it stands.";
    case "quote_replies_required":
      return "Record at least one shop reply before publishing.";
    case "invalid_quote_options":
      return `Publish one to ${MAX_QUOTE_OPTIONS} replies, one per shop.`;
    case "quote_reply_not_found":
      return "That reply was withdrawn or removed. Refresh and choose again.";
    case "quote_request_version_conflict":
    case "quote_reply_version_conflict":
      return "Someone else changed this request a moment ago. It has been refreshed; check it and try again.";
    case "invalid_quote_validity":
      return `Choose a date after today and at most ${QUOTE_VALIDITY_MAX_DAYS} days away.`;
    case "invalid_production_time":
      return "GRIDGO could not use this production time. Choose Same day with hours, or Days with whole working days.";
    case "invalid_quote_validity_days":
      return `Quote validity is whole days, ${QUOTE_VALIDITY_DAYS.min} to ${QUOTE_VALIDITY_DAYS.max}.`;
    case "quote_request_not_found":
      return "This quote request no longer exists.";
    case "invalid_quote_request": {
      const field = typeof details?.field === "string" ? details.field : "";
      if (field === "priceMinor") return "Enter the shop's price for the whole job, above ₱0.";
      if (field === "reason") return "Write a reason.";
      return "Check the reply's fields and try again.";
    }
    default:
      return null;
  }
}

/** "₱3,450.00" or a dash. */
export function money(minor: number | null | undefined): string {
  return typeof minor === "number" ? formatPhp(minor) : "—";
}
