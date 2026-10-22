/**
 * The shop's own reviews and record.
 *
 * Wording follows gridgo-supplier `app/reviews.tsx`, `app/late-production.tsx`,
 * `lib/productionLapse.ts`, `lib/shopRecovery.ts`, and `lib/reschedule.ts`.
 * A 404, a 405, or a body that is not the feed is "not open yet". Any other
 * failure is a failed read. Neither is an empty list.
 */

import { ApiError } from "@/lib/api/client";
import { formatPhp } from "@/lib/format";

export type FeedRead<T> = { status: "loaded"; value: T } | { status: "not_open_yet" } | { status: "failed" };

export const NOT_OPEN_YET = "GRIDGO is not showing this to shops on this connection yet.";
export const NO_MONEY_TAKEN = "Warnings only — no money is taken";

export function readFeed<T>(body: T | null, error?: unknown): FeedRead<T> {
  if (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      return { status: "not_open_yet" };
    }
    return { status: "failed" };
  }
  return body ? { status: "loaded", value: body } : { status: "not_open_yet" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type ShopReview = {
  id: string;
  orderId: string;
  createdAt: string;
  qualityStars: number;
  speedStars: number;
  valueStars: number;
  comment: string | null;
  itemName: string | null;
};

export type CategoryStanding = {
  categoryCode: string;
  categoryName: string;
  overall: number | null;
  count: number;
  position: number | null;
  of: number;
};

export type MyReviews = {
  summary: {
    count: number;
    overall: number | null;
    quality: number | null;
    speed: number | null;
    value: number | null;
    onTime: { count: number; rate: number } | null;
    reviewsUntilMatching: number;
  };
  ranking: { position: number | null; of: number; byCategory: CategoryStanding[] };
  reviews: ShopReview[];
};

function stars(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeReviews(raw: unknown): MyReviews | null {
  if (!isRecord(raw) || !isRecord(raw.summary) || !Array.isArray(raw.reviews)) return null;
  const summary = raw.summary;
  const ranking = isRecord(raw.ranking) ? raw.ranking : {};
  const count = typeof summary.count === "number" ? summary.count : raw.reviews.length;
  const onTime = isRecord(summary.onTime) ? summary.onTime : null;
  const categories = Array.isArray(ranking.byCategory) ? ranking.byCategory : [];
  return {
    summary: {
      count,
      overall: stars(summary.overall),
      quality: stars(summary.quality),
      speed: stars(summary.speed),
      value: stars(summary.value),
      onTime:
        onTime && typeof onTime.count === "number" && typeof onTime.rate === "number"
          ? { count: onTime.count, rate: onTime.rate }
          : null,
      reviewsUntilMatching: typeof summary.reviewsUntilMatching === "number" ? summary.reviewsUntilMatching : 0,
    },
    ranking: {
      position: typeof ranking.position === "number" ? ranking.position : null,
      of: typeof ranking.of === "number" ? ranking.of : 0,
      byCategory: categories.flatMap((row) => {
        if (!isRecord(row)) return [];
        const categoryCode = text(row.categoryCode);
        if (!categoryCode) return [];
        return [
          {
            categoryCode,
            categoryName: text(row.categoryName) || categoryCode,
            overall: stars(row.overall),
            count: typeof row.count === "number" ? row.count : 0,
            position: typeof row.position === "number" ? row.position : null,
            of: typeof row.of === "number" ? row.of : 0,
          },
        ];
      }),
    },
    reviews: raw.reviews.flatMap((row) => {
      if (!isRecord(row)) return [];
      const id = text(row.id);
      const orderId = text(row.orderId);
      if (!id || !orderId) return [];
      return [
        {
          id,
          orderId,
          createdAt: text(row.createdAt),
          qualityStars: stars(row.qualityStars) ?? 0,
          speedStars: stars(row.speedStars) ?? 0,
          valueStars: stars(row.valueStars) ?? 0,
          comment: text(row.comment) || null,
          itemName: text(row.itemName) || null,
        },
      ];
    }),
  };
}

export function formatStars(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function standingLine(
  summary: Pick<MyReviews["summary"], "count" | "overall">,
  ranking: Pick<MyReviews["ranking"], "position" | "of">,
): string {
  if (summary.count === 0) return "No reviews yet";
  const starsLabel = `${formatStars(summary.overall)} out of 5 from ${summary.count === 1 ? "1 review" : `${summary.count} reviews`}`;
  if (ranking.position == null) return starsLabel;
  return `${starsLabel}. Ranked #${ranking.position} of ${ranking.of === 1 ? "1 shop" : `${ranking.of} shops`}`;
}

export function whyMatchingWaits(reviewsUntilMatching: number): string {
  if (reviewsUntilMatching <= 0) return "GRIDGO now matches jobs to you on your quality stars.";
  return `GRIDGO matches on your quality stars once you have 5 reviews. ${
    reviewsUntilMatching === 1 ? "One more to go." : `${reviewsUntilMatching} more to go.`
  } Until then it goes by how complete your board is.`;
}

export function starWord(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Not rated yet";
  switch (Math.round(value)) {
    case 1:
      return "Poor";
    case 2:
      return "Below what they expected";
    case 3:
      return "About what they expected";
    case 4:
      return "Better than they expected";
    default:
      return "Excellent";
  }
}

export type LapseStatus = "warning_only" | "warned" | "applied" | "closed";
export type ProductionLapse = {
  id: string;
  orderId: string;
  deadlineAt: string;
  tier: "minor" | "moderate" | "severe";
  status: LapseStatus;
  remainingBalanceMinor: number;
  deductionMinor: number;
};

const TIERS = ["minor", "moderate", "severe"] as const;
const LAPSE_STATUSES = ["warning_only", "warned", "applied", "closed"] as const;

export function normalizeLapses(raw: unknown): ProductionLapse[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.lapses)) return null;
  return raw.lapses.flatMap((row) => {
    if (!isRecord(row)) return [];
    const id = text(row.id);
    const orderId = text(row.orderId);
    const tier = TIERS.find((item) => item === row.tier);
    if (!id || !orderId || !tier) return [];
    const appliedAt = text(row.appliedAt) || null;
    const closedAt = text(row.closedAt) || null;
    const declared = LAPSE_STATUSES.find((status) => status === row.status);
    const status: LapseStatus = declared ?? (appliedAt ? "applied" : closedAt ? "closed" : "warning_only");
    const minor = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0);
    return [
      {
        id,
        orderId,
        deadlineAt: text(row.deadlineAt),
        tier,
        status,
        remainingBalanceMinor: minor(row.remainingBalanceMinor),
        deductionMinor: minor(row.deductionMinor),
      },
    ];
  });
}

/** Already taken, and never more than what was still owed. Not subtracted again. */
export function cappedDeductionMinor(lapse: Pick<ProductionLapse, "deductionMinor" | "remainingBalanceMinor">): number {
  return Math.min(lapse.deductionMinor, lapse.remainingBalanceMinor);
}

/**
 * A warning, including while deductions are switched off, never quotes a peso
 * amount. Only an applied record names money, and it names the amount already
 * taken once.
 */
export function lapseStandingLine(lapse: ProductionLapse): string {
  switch (lapse.status) {
    case "warning_only":
      return "Warning only, no deduction";
    case "warned":
      return NO_MONEY_TAKEN;
    case "applied":
      return `${formatPhp(cappedDeductionMinor(lapse))} off ${formatPhp(lapse.remainingBalanceMinor)} still owed`;
    case "closed":
      return "Closed, no deduction";
  }
}

export type ShopFailure = {
  id: string;
  orderId: string;
  kind: "timed_out" | "declined" | "cancelled";
  stage: string;
  reason: string;
  at: string;
};

const KINDS = ["timed_out", "declined", "cancelled"] as const;

export function normalizeShopFailures(body: unknown): ShopFailure[] | null {
  if (!isRecord(body) || !Array.isArray(body.events)) return null;
  const out: ShopFailure[] = [];
  for (const row of body.events) {
    if (!isRecord(row)) continue;
    const kind = KINDS.find((item) => item === row.kind);
    const id = text(row.id);
    const orderId = text(row.orderId);
    const at = text(row.at);
    if (!kind || !id || !orderId || Number.isNaN(Date.parse(at))) continue;
    out.push({ id, orderId, kind, stage: text(row.stage), reason: text(row.reason), at });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export const FAILURE_LABELS: Record<ShopFailure["kind"], string> = {
  timed_out: "Not answered in time",
  declined: "Passed on",
  cancelled: "Cancelled",
};

export type DeadlineRequest = {
  id: string;
  orderId: string;
  status: "pending" | "accepted" | "declined" | "expired" | "operations_required";
  proposedReadyBy: string;
};

const REQUEST_STATUSES = ["pending", "accepted", "declined", "expired", "operations_required"] as const;

export function normalizeRescheduleRequests(body: unknown): DeadlineRequest[] | null {
  if (!isRecord(body) || !Array.isArray(body.requests)) return null;
  return body.requests.flatMap((row) => {
    if (!isRecord(row)) return [];
    const status = REQUEST_STATUSES.find((item) => item === row.status);
    const id = text(row.id);
    const orderId = text(row.orderId);
    if (!status || !id || !orderId) return [];
    return [{ id, orderId, status, proposedReadyBy: text(row.proposedReadyBy) }];
  });
}

export function deadlineLabel(status: DeadlineRequest["status"]): string {
  switch (status) {
    case "pending":
      return "Waiting for the client";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "expired":
      return "Not answered";
    case "operations_required":
      return "With Operations";
  }
}
