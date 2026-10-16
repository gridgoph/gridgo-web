/**
 * The pricing dashboard's date range, checked before it is sent
 * (gridgo-api#253: `GET /admin/pricing` reads at most 366 days, defaults to
 * the last 30, and a comparison needs both of its dates).
 */

import { isApiError } from "@/lib/api/client";

export const PRICING_MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

type Range = { from: string; to: string; compareFrom: string; compareTo: string };

function span(from: string, to: string): string | null {
  if (!from || !to) return null;
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
  if (start > end) return "The start date is after the end date.";
  if (end - start > PRICING_MAX_RANGE_DAYS * DAY_MS) {
    return `Choose a range of ${PRICING_MAX_RANGE_DAYS} days or fewer.`;
  }
  return null;
}

/** What is wrong with the dates, in the words the API would answer, or null. */
export function pricingRangeProblem(range: Range): string | null {
  const selected = span(range.from, range.to);
  if (selected) return selected;
  if (Boolean(range.compareFrom) !== Boolean(range.compareTo)) {
    return "Choose both a start and an end date to compare.";
  }
  const compared = span(range.compareFrom, range.compareTo);
  return compared ? `Comparison: ${compared}` : null;
}

/** A refused range says why; anything else is left to the page's own copy. */
export function pricingRangeError(err: unknown): string | null {
  if (!isApiError(err)) return null;
  if (err.code === "pricing_range_too_long") {
    return `Choose a range of ${PRICING_MAX_RANGE_DAYS} days or fewer.`;
  }
  if (err.code === "invalid_pricing_range") {
    return "Check the dates: the start must come before the end, and a comparison needs both dates.";
  }
  return null;
}
