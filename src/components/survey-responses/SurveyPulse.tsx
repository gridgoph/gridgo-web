"use client";

import { Star } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { SurveyAggregates } from "@/lib/api/types";
import {
  PRICE_FEELINGS,
  formatAverage,
  formatNps,
  percentOf,
  priceFeelingNear,
} from "@/lib/survey-responses";
import { cn } from "@/lib/utils";

/**
 * The figures over every response the filters match: NPS with its three
 * groups, the three star averages, and where the price felt on its scale.
 * Empty figures are a dash, never zero (the API sends null).
 */
export function SurveyPulse({
  aggregates,
  loading,
}: {
  aggregates: SurveyAggregates | null;
  loading: boolean;
}) {
  const waiting = loading && !aggregates;
  const counts = aggregates?.counts;
  const answered = counts?.recommendScore ?? 0;
  const groups = [
    {
      key: "detractors",
      label: "Detractors",
      range: "0 to 6",
      count: aggregates?.detractors ?? 0,
      fill: "bg-error",
    },
    {
      key: "passives",
      label: "Passives",
      range: "7 or 8",
      count: aggregates?.passives ?? 0,
      fill: "bg-text-muted",
    },
    {
      key: "promoters",
      label: "Promoters",
      range: "9 or 10",
      count: aggregates?.promoters ?? 0,
      fill: "bg-success",
    },
  ];

  return (
    <section className="gg-card-flush" aria-labelledby="survey-pulse-title" aria-busy={waiting || undefined}>
      <h2 id="survey-pulse-title" className="sr-only">
        Survey figures
      </h2>
      <div className="grid gap-5 p-4 md:p-5 lg:grid-cols-[minmax(11rem,auto)_1fr] lg:items-center lg:gap-8">
        <div className="flex flex-col">
          <p className="text-body text-text-secondary m-0">Net Promoter Score</p>
          {waiting ? (
            <Skeleton className="mt-2 h-12 w-24" aria-hidden />
          ) : (
            <p
              className="text-text-primary m-0 tabular-nums"
              style={{ fontFamily: "var(--font-bold)", fontSize: 52, lineHeight: "60px", letterSpacing: "-1px" }}
            >
              {formatNps(aggregates?.nps)}
            </p>
          )}
          <p className="text-caption text-text-muted m-0">
            {waiting
              ? "Counting answers…"
              : answered
                ? `From ${answered.toLocaleString("en-PH")} recommend ${answered === 1 ? "answer" : "answers"}, −100 to +100`
                : "Nobody has answered the recommend question yet"}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div
            className="bg-surface-variant flex h-4 w-full overflow-hidden rounded-full"
            role="img"
            aria-label={
              answered
                ? groups.map((group) => `${group.label} ${percentOf(group.count, answered)}%`).join(", ")
                : "No recommend answers yet"
            }
          >
            {answered
              ? groups.map((group) =>
                  group.count ? (
                    <span
                      key={group.key}
                      className={cn("h-full first:rounded-l-full last:rounded-r-full", group.fill)}
                      style={{ width: `${(group.count / answered) * 100}%` }}
                    />
                  ) : null,
                )
              : null}
          </div>
          <dl className="m-0 grid grid-cols-3 gap-3">
            {groups.map((group) => (
              <div key={group.key} className="flex min-w-0 flex-col">
                <dt className="text-caption text-text-muted flex items-center gap-1.5">
                  <span className={cn("size-2.5 shrink-0 rounded-full", group.fill)} aria-hidden />
                  <span className="truncate">
                    {group.label}, {group.range}
                  </span>
                </dt>
                <dd className="m-0 flex items-baseline gap-1.5">
                  <span className="text-h3 text-text-primary tabular-nums">
                    {waiting ? "…" : group.count.toLocaleString("en-PH")}
                  </span>
                  {answered ? (
                    <span className="text-caption text-text-muted tabular-nums">
                      {percentOf(group.count, answered)}%
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <dl className="border-outline m-0 grid grid-cols-2 border-t lg:grid-cols-4">
        <StarFigure
          label="Handover"
          hint="Delivery or pick-up"
          average={aggregates?.averages.fulfillmentStars ?? null}
          count={counts?.fulfillmentStars ?? 0}
          waiting={waiting}
        />
        <StarFigure
          label="Ordering"
          average={aggregates?.averages.easeStars ?? null}
          count={counts?.easeStars ?? 0}
          waiting={waiting}
        />
        <StarFigure
          label="Quality"
          hint="Print quality"
          average={aggregates?.averages.qualityStars ?? null}
          count={counts?.qualityStars ?? 0}
          waiting={waiting}
          optional
        />
        <PriceFigure
          average={aggregates?.averages.priceFeeling ?? null}
          count={counts?.priceFeeling ?? 0}
          waiting={waiting}
        />
      </dl>
    </section>
  );
}

// Two figures a row below desktop, four on one row from 1024px.
const FIGURE =
  "border-outline flex min-w-0 flex-col gap-1.5 p-4 md:px-5 [&:nth-child(n+3)]:border-t [&:nth-child(even)]:border-l lg:[&:nth-child(n+3)]:border-t-0 lg:[&:not(:first-child)]:border-l";

function answersLine(count: number, optional?: boolean): string {
  if (!count) return optional ? "Optional, nobody answered yet" : "No answers yet";
  return `${count.toLocaleString("en-PH")} ${count === 1 ? "answer" : "answers"}${optional ? ", optional" : ""}`;
}

function StarFigure({
  label,
  average,
  count,
  waiting,
  optional,
  hint,
}: {
  label: string;
  hint?: string;
  average: number | null;
  count: number;
  waiting: boolean;
  optional?: boolean;
}) {
  return (
    <div className={FIGURE}>
      <dt className="text-body text-text-secondary">
        {label}
        {hint ? <span className="text-caption text-text-muted">, {hint.toLowerCase()}</span> : null}
      </dt>
      <dd className="m-0 flex flex-col gap-1.5">
        <span className="flex items-baseline gap-1">
          <span className="text-h2 text-text-primary tabular-nums">{waiting ? "…" : formatAverage(average)}</span>
          <span className="text-caption text-text-muted">of 5</span>
        </span>
        <StarMeter value={average} />
        <span className="text-caption text-text-muted">{waiting ? "Counting…" : answersLine(count, optional)}</span>
      </dd>
    </div>
  );
}

/** Five stars filled to the average, monochrome. The number beside it is the reading. */
export function StarMeter({ value, size = 16 }: { value: number | null; size?: number }) {
  const width = value == null ? 0 : Math.min(100, Math.max(0, (value / 5) * 100));
  const row = (filled: boolean) =>
    Array.from({ length: 5 }, (_, index) => (
      <Star
        key={index}
        aria-hidden
        strokeWidth={1.75}
        style={{ width: size, height: size }}
        className={cn("shrink-0", filled ? "fill-current text-text-primary" : "text-outline")}
      />
    ));
  return (
    <span className="relative inline-flex w-max gap-0.5" aria-hidden>
      {row(false)}
      <span className="absolute inset-y-0 left-0 inline-flex gap-0.5 overflow-hidden" style={{ width: `${width}%` }}>
        {row(true)}
      </span>
    </span>
  );
}

function PriceFigure({ average, count, waiting }: { average: number | null; count: number; waiting: boolean }) {
  const near = priceFeelingNear(average);
  const position = average == null ? null : ((Math.min(5, Math.max(1, average)) - 1) / 4) * 100;
  return (
    <div className={FIGURE}>
      <dt className="text-body text-text-secondary">Price</dt>
      <dd className="m-0 flex flex-col gap-1.5">
        <span className="flex items-baseline gap-1.5">
          <span className="text-h2 text-text-primary">{waiting ? "…" : (near ?? "—")}</span>
          {average != null ? (
            <span className="text-caption text-text-muted tabular-nums">{formatAverage(average)} of 5</span>
          ) : null}
        </span>
        <span
          className="relative mt-1 flex h-4 items-center"
          role="img"
          aria-label={
            average == null
              ? "No price answers yet"
              : `Average ${formatAverage(average)} on a scale from ${PRICE_FEELINGS[0]} (1) to ${PRICE_FEELINGS[4]} (5)`
          }
        >
          <span className="bg-outline absolute inset-x-0 h-0.5 rounded-full" aria-hidden />
          {PRICE_FEELINGS.map((word, index) => (
            <span
              key={word}
              aria-hidden
              className="bg-outline absolute h-2 w-0.5 -translate-x-1/2 rounded-full"
              style={{ left: `${index * 25}%` }}
            />
          ))}
          {position != null ? (
            <span
              aria-hidden
              className="bg-text-primary border-surface absolute size-3.5 -translate-x-1/2 rounded-full border-2"
              style={{ left: `${position}%` }}
            />
          ) : null}
        </span>
        <span className="text-caption text-text-muted flex justify-between gap-2" aria-hidden>
          <span>{PRICE_FEELINGS[0]}</span>
          <span>{PRICE_FEELINGS[4]}</span>
        </span>
        <span className="text-caption text-text-muted">{waiting ? "Counting…" : answersLine(count)}</span>
      </dd>
    </div>
  );
}
