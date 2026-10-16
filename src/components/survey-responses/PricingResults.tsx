"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ListChecks } from "lucide-react";

import { saveCsv } from "@/components/survey-responses/save-csv";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadPricingFeedback, getPricingFeedback } from "@/lib/api/client";
import type { PricingFeedbackReport, PricingQuestionTally } from "@/lib/api/types";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import {
  CHECKOUT_EXIT_QUESTION,
  PRICING_QUESTIONS,
  type PricingQuestion,
  answeredLine,
  exitReasonLabel,
  formatPercent,
  leadingCodes,
  pricingErrorMessage,
} from "@/lib/pricing-feedback";
import {
  type SurveyFilterState,
  datesBackwards,
  pricingQuery,
} from "@/lib/survey-responses";
import { cn } from "@/lib/utils";

const BOLD = { fontFamily: "var(--font-bold)" } as const;
const MEDIUM = { fontFamily: "var(--font-medium)" } as const;

/**
 * Counts and percentages for every pricing question and for the checkout exit
 * question (`GET /admin/pricing-feedback`), over everything the shared filters
 * match. Each option is a row with its count and share; the most chosen answer
 * reads in full ink so the result is visible before the numbers are read.
 */
export function PricingResults({
  filters,
  onShowExits,
}: {
  filters: SurveyFilterState;
  onShowExits: () => void;
}) {
  const query = useMemo(() => pricingQuery(filters), [filters]);
  const backwards = datesBackwards(filters);
  const [report, setReport] = useState<PricingFeedbackReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const sequence = useRef(0);

  const read = useCallback(
    async (quiet: boolean) => {
      if (backwards) return;
      const ticket = ++sequence.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const next = await getPricingFeedback(query);
        if (ticket === sequence.current) setReport(next);
      } catch (err) {
        if (ticket === sequence.current) {
          setError(
            pricingErrorMessage(err, "The pricing results did not load. Try again."),
          );
        }
      } finally {
        if (ticket === sequence.current) setLoading(false);
      }
    },
    [query, backwards],
  );

  useEffect(() => {
    setReport(null);
    void read(false);
  }, [read]);

  // A new survey answer sends Super Admin a notice; the figures move with it.
  const refresh = useCallback(() => read(true), [read]);
  useLegalInboxReload("order_survey_submitted", refresh);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      saveCsv(await downloadPricingFeedback(query), "pricing-feedback.csv");
    } catch (err) {
      setExportError(
        pricingErrorMessage(err, "The CSV could not be downloaded. Try again."),
      );
    } finally {
      setExporting(false);
    }
  }

  if (backwards) return null;
  if (error && !report) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void read(false)}>
            Try again
          </Button>
        }
      />
    );
  }

  const waiting = loading && !report;
  const responses = report?.survey.responses ?? 0;
  const exits = report?.checkoutExit;
  const nothing = report && !responses && !exits?.asked;

  return (
    <div className="flex flex-col gap-6" aria-busy={waiting || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-text-muted m-0 max-w-prose" aria-live="polite">
          {waiting
            ? "Counting answers…"
            : `${countWords(responses, "survey response")} and ${countWords(exits?.asked ?? 0, "checkout question")} asked match these filters. Each share is of the clients who answered that question.`}
        </p>
        <Button
          variant="outline"
          disabled={exporting || waiting || Boolean(nothing)}
          onClick={() => void exportCsv()}
        >
          <Download aria-hidden />
          {exporting ? "Preparing…" : "Export CSV"}
        </Button>
      </div>
      {exportError ? (
        <p className="text-body text-error m-0" role="alert">
          {exportError}
        </p>
      ) : null}

      {nothing ? (
        <EmptyState
          title="No pricing answers match these filters"
          body="Widen the dates or clear a filter above. Answers arrive as clients finish the survey after an order, or answer the question after leaving checkout."
        />
      ) : (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="pricing-survey-title">
            <div className="flex flex-col gap-0.5">
              <h2 id="pricing-survey-title" className="text-h3 text-text-primary m-0">
                After an order
              </h2>
              <p className="text-caption text-text-muted m-0 max-w-prose">
                From the survey a client gets once an order reaches them. How the price
                felt is required; the other price questions are optional.
              </p>
            </div>
            {report && !responses ? (
              <p className="gg-panel text-body text-text-secondary m-0">
                No survey responses match these filters.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {PRICING_QUESTIONS.map((question) => (
                  <QuestionCard
                    key={question.key}
                    question={question}
                    tally={report?.survey.questions[question.key] ?? null}
                    of={responses}
                    waiting={waiting}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="pricing-exit-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 id="pricing-exit-title" className="text-h3 text-text-primary m-0">
                  Left at checkout
                </h2>
                <p className="text-caption text-text-muted m-0 max-w-prose">
                  Asked once, on a later app open, of a client who reached checkout and
                  did not pay within an hour. At most once a week per account, with no
                  reward.
                </p>
              </div>
              <Button variant="outline" onClick={onShowExits}>
                <ListChecks aria-hidden />
                See each answer
              </Button>
            </div>
            {report && !exits?.asked ? (
              <p className="gg-panel text-body text-text-secondary m-0">
                No checkout questions were asked within these filters.
              </p>
            ) : (
              <ExitCard report={report} waiting={waiting} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function countWords(count: number, noun: string): string {
  return `${count.toLocaleString("en-PH")} ${noun}${count === 1 ? "" : "s"}`;
}

function QuestionCard({
  question,
  tally,
  of,
  waiting,
}: {
  question: PricingQuestion;
  tally: PricingQuestionTally | null;
  of: number;
  waiting: boolean;
}) {
  const id = `pricing-q-${question.key}`;
  return (
    <section
      className={cn("gg-card flex flex-col gap-3", question.chooseAny && "lg:col-span-2")}
      aria-labelledby={id}
    >
      <div className="flex flex-col gap-0.5">
        <h3 id={id} className="text-body text-text-primary m-0" style={BOLD}>
          {question.title}
        </h3>
        <p className="text-caption text-text-muted m-0">
          {waiting ? "Counting…" : answeredLine(tally?.answered ?? 0, of)}
          {question.note ? `. ${question.note}` : null}
        </p>
      </div>
      {waiting ? (
        <Skeleton className="h-40 w-full" aria-hidden />
      ) : tally ? (
        <OptionRows
          tally={tally}
          label={question.label}
          apart={question.apart}
          twoColumns={question.chooseAny}
        />
      ) : (
        <p className="text-body text-text-muted m-0">
          This GRIDGO server does not count this question.
        </p>
      )}
    </section>
  );
}

/**
 * One row per option, in the API's order (which is the scale's). Options set
 * apart (not sure, not worth it) sit below a rule, off the scale.
 */
function OptionRows({
  tally,
  label,
  apart = [],
  twoColumns,
}: {
  tally: PricingQuestionTally;
  label: (code: string) => string;
  apart?: readonly string[];
  twoColumns?: boolean;
}) {
  const leaders = leadingCodes(tally);
  const onScale = tally.options.filter((option) => !apart.includes(option.code));
  const offScale = tally.options.filter((option) => apart.includes(option.code));
  const row = (option: PricingQuestionTally["options"][number]) => (
    <OptionRow
      key={option.code}
      label={label(option.code)}
      count={option.count}
      percent={option.percent}
      leading={leaders.includes(option.code)}
    />
  );
  return (
    <div className="flex flex-col gap-3">
      <ul
        className={cn(
          "m-0 grid list-none gap-x-8 gap-y-2.5 p-0",
          twoColumns && "md:grid-cols-2",
        )}
      >
        {onScale.map(row)}
      </ul>
      {offScale.length ? (
        <ul className="border-outline m-0 grid list-none gap-2.5 border-t p-0 pt-3">
          {offScale.map(row)}
        </ul>
      ) : null}
    </div>
  );
}

function OptionRow({
  label,
  count,
  percent,
  leading,
}: {
  label: string;
  count: number;
  percent: number | null;
  leading: boolean;
}) {
  const width = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "text-body min-w-0",
            leading ? "text-text-primary" : "text-text-secondary",
          )}
          style={leading ? MEDIUM : undefined}
        >
          {label}
        </span>
        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
          <span className="text-caption text-text-muted">
            {count.toLocaleString("en-PH")}
            <span className="sr-only">{count === 1 ? " client" : " clients"},</span>
          </span>
          <span
            className={cn(
              "text-body min-w-12 text-right",
              leading ? "text-text-primary" : "text-text-secondary",
            )}
            style={leading ? BOLD : undefined}
          >
            {formatPercent(percent)}
          </span>
        </span>
      </span>
      <span
        className="bg-surface-variant block h-1.5 w-full overflow-hidden rounded-full"
        aria-hidden
      >
        <span
          className={cn(
            "block h-full rounded-full",
            leading ? "bg-text-primary" : "bg-text-muted",
          )}
          style={{ width: `${width}%` }}
        />
      </span>
    </li>
  );
}

/** What happened to each question asked, then why the answered ones left. */
function ExitCard({
  report,
  waiting,
}: {
  report: PricingFeedbackReport | null;
  waiting: boolean;
}) {
  const exit = report?.checkoutExit;
  const asked = exit?.asked ?? 0;
  const outcomes = [
    {
      key: "answered",
      label: "Answered",
      count: exit?.answered ?? 0,
      fill: "bg-text-primary",
    },
    {
      key: "skipped",
      label: "Skipped",
      count: exit?.skipped ?? 0,
      fill: "bg-text-muted",
    },
    {
      key: "unanswered",
      label: "Closed without answering",
      count: exit?.unanswered ?? 0,
      fill: "gg-invoice-hatch text-text-muted",
    },
  ];
  return (
    <div className="gg-card-flush grid lg:grid-cols-[minmax(16rem,2fr)_3fr]">
      <div className="border-outline flex flex-col gap-3 p-4 md:p-5 lg:border-r">
        <p className="text-body text-text-secondary m-0">Questions asked</p>
        {waiting ? (
          <Skeleton className="h-12 w-20" aria-hidden />
        ) : (
          <p
            className="text-text-primary m-0 tabular-nums"
            style={{
              fontFamily: "var(--font-bold)",
              fontSize: 52,
              lineHeight: "60px",
              letterSpacing: "-1px",
            }}
          >
            {asked.toLocaleString("en-PH")}
          </p>
        )}
        <div
          className="bg-surface-variant flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={
            asked
              ? outcomes.map((outcome) => `${outcome.label} ${outcome.count}`).join(", ")
              : "No questions asked yet"
          }
        >
          {asked
            ? outcomes.map((outcome) =>
                outcome.count ? (
                  <span
                    key={outcome.key}
                    className={cn(
                      "h-full first:rounded-l-full last:rounded-r-full",
                      outcome.fill,
                    )}
                    style={{ width: `${(outcome.count / asked) * 100}%` }}
                  />
                ) : null,
              )
            : null}
        </div>
        <dl className="m-0 flex flex-col gap-1.5">
          {outcomes.map((outcome) => (
            <div key={outcome.key} className="flex items-baseline justify-between gap-3">
              <dt className="text-caption text-text-muted flex items-center gap-1.5">
                <span
                  className={cn(
                    "border-outline size-2.5 shrink-0 rounded-full border",
                    outcome.fill,
                  )}
                  aria-hidden
                />
                {outcome.label}
              </dt>
              <dd className="text-body text-text-primary m-0 tabular-nums">
                {waiting ? "…" : outcome.count.toLocaleString("en-PH")}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-text-muted m-0">
          A skip or a close still counts toward the week, so the client is not asked again
          soon.
        </p>
      </div>
      <div className="border-outline flex flex-col gap-3 border-t p-4 md:p-5 lg:border-t-0">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-body text-text-primary m-0" style={BOLD}>
            {CHECKOUT_EXIT_QUESTION}
          </h3>
          <p className="text-caption text-text-muted m-0">
            {waiting ? "Counting…" : answeredLine(exit?.reasons.answered ?? 0, asked)}.
            One answer each.
          </p>
        </div>
        {waiting ? (
          <Skeleton className="h-40 w-full" aria-hidden />
        ) : exit ? (
          <OptionRows tally={exit.reasons} label={exitReasonLabel} apart={["other"]} />
        ) : null}
      </div>
    </div>
  );
}
