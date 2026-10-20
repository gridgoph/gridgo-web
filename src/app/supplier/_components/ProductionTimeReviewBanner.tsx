"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PRODUCTION_TIME_REVIEW_TITLE,
  reviewReasonLine,
  type ProductionTimeReviewReason,
} from "@/lib/production-time-choice";

type Props = {
  reasons: readonly ProductionTimeReviewReason[];
  /** Opens the Speed step; left out while the shop is already on it. */
  onCheck?: () => void;
  /** "Keep 1 working day": saves the time the listing already holds, which clears the reminder. */
  keepLabel?: string | null;
  onKeep?: () => void;
  busy?: boolean;
  error?: string | null;
};

/**
 * "Check your production time" on a listing GRIDGO asks the shop to confirm:
 * an older one-working-day setting, or an Express listing that never said how
 * many hours it takes. Saving any production time clears it.
 */
export function ProductionTimeReviewBanner({
  reasons,
  onCheck,
  keepLabel,
  onKeep,
  busy,
  error,
}: Props) {
  return (
    <section
      aria-labelledby="production-time-review-heading"
      className="border-warning bg-card flex flex-col gap-2 rounded-field border p-3"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-[18px] shrink-0"
          style={{ color: "var(--color-warning)" }}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            id="production-time-review-heading"
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {PRODUCTION_TIME_REVIEW_TITLE}
          </h3>
          {reasons.map((reason) => (
            <p key={reason} className="text-caption text-text-secondary m-0 max-w-prose">
              {reviewReasonLine(reason)}
            </p>
          ))}
        </div>
      </div>
      {onCheck || (keepLabel && onKeep) ? (
        <div className="flex flex-wrap gap-2">
          {onCheck ? (
            <Button type="button" onClick={onCheck}>
              Check production time
            </Button>
          ) : null}
          {keepLabel && onKeep ? (
            <Button type="button" disabled={busy} onClick={onKeep}>
              {keepLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="text-caption text-destructive m-0" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
