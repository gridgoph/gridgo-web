"use client";

import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  FORCED_BY_GRIDGO,
  forcedByGridgo,
  forcedReasonLabel,
  forcedSteps,
  forcedSummary,
  skippedCheckLabel,
} from "@/lib/shop-handover";

/**
 * A step GRIDGO forced past a missing check. A record only: the shop cannot
 * force a step, and the rider still checks the job at the counter.
 */
export function SupplierForcedNotice({ order }: { order: Order }) {
  if (!forcedByGridgo(order)) return null;
  const steps = forcedSteps(order);

  return (
    <section
      aria-label="Forced step"
      className="border-outline-subtle bg-surface-variant flex flex-col gap-3 rounded-field border px-3 py-2"
    >
      <p className="text-overline text-text-muted m-0 uppercase">{FORCED_BY_GRIDGO}</p>
      {steps.length === 0 ? (
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Operations moved a step on this job past a missing check. The rider still
          checks the job at the counter.
        </p>
      ) : (
        steps.map((step, index) => {
          const skipped = [...new Set(step.skippedChecks.map((code) => skippedCheckLabel(code)))];
          return (
            <div key={`${step.at}:${index}`} className="flex flex-col gap-0.5">
              <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                {step.to === "ready_for_dispatch"
                  ? "Moved on to rider pickup"
                  : "Moved on to GRIDGO's review"}
              </p>
              <p className="text-caption text-text-muted m-0">
                {forcedReasonLabel(step.reasonCode)}, {formatDateTime(step.at)}
              </p>
              {step.note ? (
                <p className="text-body text-text-secondary m-0">“{step.note}”</p>
              ) : null}
              {skipped.length ? (
                <p className="text-caption text-text-muted m-0">Skipped: {skipped.join(", ")}</p>
              ) : null}
            </div>
          );
        })
      )}
      <p className="text-caption text-text-muted m-0 max-w-prose">{forcedSummary(order)}</p>
    </section>
  );
}
