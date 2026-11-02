/**
 * Operations' quote-request endpoints (contract `gridgo-api/docs/QUOTE_REQUESTS_API.md`).
 * Operations and Super Admin only; every mutation takes the request's
 * `expectedVersion`, so a stale screen is refused rather than overwriting
 * someone else's change.
 */

import { apiRequest } from "@/lib/api/client";
import {
  quoteProductionTime,
  type QuoteFilter,
  type QuoteOption,
  type QuoteReply,
  type QuoteRequest,
  type ReplyBody,
} from "@/lib/quote-requests";

type Raw = Record<string, unknown>;

function readReply(raw: QuoteReply): QuoteReply {
  return {
    ...raw,
    productionTime: quoteProductionTime((raw as unknown as Raw).productionTime),
    recommendedOptions: raw.recommendedOptions ?? "",
    note: raw.note ?? "",
    publishedLabel: raw.publishedLabel ?? null,
    clientPriceMinor: raw.clientPriceMinor ?? null,
    readyBy: raw.readyBy ?? null,
    eventDateFit: raw.eventDateFit ?? null,
  };
}

function readOption(raw: QuoteOption): QuoteOption {
  return {
    ...raw,
    productionTime: quoteProductionTime((raw as unknown as Raw).productionTime),
    recommendedOptions: raw.recommendedOptions ?? "",
    readyBy: raw.readyBy ?? null,
    eventDateFit: raw.eventDateFit ?? null,
  };
}

/** Fills the arrays and nulls an older or partial answer may leave out. */
export function readQuoteRequest(raw: QuoteRequest): QuoteRequest {
  return {
    ...raw,
    notes: raw.notes ?? "",
    budgetMinor: raw.budgetMinor ?? null,
    eventDate: raw.eventDate ?? null,
    referenceFiles: Array.isArray(raw.referenceFiles) ? raw.referenceFiles : [],
    ranking: Array.isArray(raw.ranking) ? raw.ranking : [],
    options: Array.isArray(raw.options) ? raw.options.map(readOption) : [],
    replies: Array.isArray(raw.replies) ? raw.replies.map(readReply) : [],
    matchReason: raw.matchReason ?? null,
    eventDateWarning: raw.eventDateWarning ?? null,
  };
}

const base = "/ops/quote-requests";
const path = (id: string) => `${base}/${encodeURIComponent(id)}`;

/** Newest 200. `all` sends no status. */
export async function listQuoteRequests(status: QuoteFilter = "all"): Promise<QuoteRequest[]> {
  const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  const result = await apiRequest<{ quoteRequests?: QuoteRequest[] }>(`${base}${query}`);
  return (result.quoteRequests ?? []).map(readQuoteRequest);
}

export async function getQuoteRequest(id: string): Promise<QuoteRequest> {
  const result = await apiRequest<{ quoteRequest: QuoteRequest }>(path(id));
  return readQuoteRequest(result.quoteRequest);
}

export async function addQuoteReply(
  id: string,
  body: ReplyBody & { expectedVersion?: number },
): Promise<QuoteRequest> {
  const result = await apiRequest<{ quoteRequest: QuoteRequest }>(`${path(id)}/replies`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return readQuoteRequest(result.quoteRequest);
}

export async function updateQuoteReply(
  id: string,
  replyId: string,
  body: Partial<Omit<ReplyBody, "supplierId">> & {
    withdrawn?: boolean;
    expectedReplyVersion?: number;
  },
): Promise<QuoteRequest> {
  const result = await apiRequest<{ quoteRequest: QuoteRequest }>(
    `${path(id)}/replies/${encodeURIComponent(replyId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return readQuoteRequest(result.quoteRequest);
}

export async function publishQuoteRequest(
  id: string,
  body: { replyIds: string[]; expectedVersion?: number },
): Promise<QuoteRequest> {
  const result = await apiRequest<{ quoteRequest: QuoteRequest }>(`${path(id)}/publish`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return readQuoteRequest(result.quoteRequest);
}

export async function setQuoteValidity(
  id: string,
  body: { validUntil: string; reason: string; expectedVersion?: number },
): Promise<QuoteRequest> {
  const result = await apiRequest<{ quoteRequest: QuoteRequest }>(`${path(id)}/validity`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return readQuoteRequest(result.quoteRequest);
}

export async function cancelQuoteRequest(
  id: string,
  body: { reason: string; expectedVersion?: number },
): Promise<QuoteRequest> {
  const result = await apiRequest<{ quoteRequest: QuoteRequest }>(`${path(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return readQuoteRequest(result.quoteRequest);
}
