"use client";

import { Sparkles } from "lucide-react";

import { formatPhp } from "@/lib/format";
import { launchBonusLine, type LaunchBonusSummary } from "@/lib/supplier-money";

/**
 * The launch-week bonus in total: what it has added, how much of the cap is
 * used, and when it ends. The bar is the cap, so a shop sees how close it is
 * without doing arithmetic. Each job's own bonus is on its row in Pay by job.
 */
export function LaunchBonusCard({
  summary,
  now = new Date(),
}: {
  summary: LaunchBonusSummary;
  now?: Date;
}) {
  const used =
    summary.capMinor && summary.capMinor > 0
      ? Math.min(1, summary.totalMinor / summary.capMinor)
      : null;

  return (
    <section className="gg-card flex flex-col gap-3" aria-label="Launch bonus" data-testid="launch-bonus">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
              Launch bonus
            </h2>
            <p
              className="text-body-lg text-success m-0 tabular-nums"
              style={{ fontFamily: "var(--font-medium)" }}
              data-testid="launch-bonus-total"
            >
              +{formatPhp(summary.totalMinor)}
            </p>
          </div>
          <p className="text-body text-text-secondary m-0" data-testid="launch-bonus-line">
            {launchBonusLine(summary, now)}
          </p>
        </div>
      </div>
      {used != null && summary.capMinor != null ? (
        <div className="flex flex-col gap-1">
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={summary.capMinor / 100}
            aria-valuenow={Math.min(summary.totalMinor, summary.capMinor) / 100}
            aria-label={`${formatPhp(summary.totalMinor)} of the ${formatPhp(summary.capMinor)} cap used`}
            className="h-2 overflow-hidden rounded-pill bg-surface-variant"
          >
            <div className="h-2 rounded-pill bg-success" style={{ width: `${used * 100}%` }} />
          </div>
          <p className="text-caption text-text-muted m-0">
            {formatPhp(summary.totalMinor)} of {formatPhp(summary.capMinor)} ·{" "}
            {summary.jobCount === 1 ? "1 job" : `${summary.jobCount} jobs`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
