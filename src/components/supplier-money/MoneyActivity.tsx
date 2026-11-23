"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPhp } from "@/lib/format";
import { orderReference } from "@/lib/order-reference";
import {
  CLIENT_PAYMENT_METHODS,
  clientPaymentLine,
  HISTORY_FILTERS,
  historyAmount,
  historyLabel,
  manilaDate,
  matchesHistoryFilter,
  paymentMethodLabel,
  settlementLabel,
  whenLabel,
  type BalanceTone,
  type HistoryFilter,
  type MoneyPeriod,
  type ShopMoneyRead,
} from "@/lib/supplier-money";

const PERIODS: readonly { value: MoneyPeriod; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

/** First screenful; "Show all" opens the rest. */
const JOBS_SHOWN = 10;
const HISTORY_SHOWN = 15;

function shortDay(day: string): string {
  return manilaDate(new Date(`${day}T12:00:00+08:00`));
}

const TONE_CLASS: Record<BalanceTone, string> = {
  owed: "text-success",
  owing: "text-error",
  even: "text-text-primary",
};

/**
 * The period's activity under the balances: how clients paid, what the shop
 * earned each day, each job's pay with how it was paid and any launch bonus,
 * and the history of every balance change. The Week/Month switch changes these
 * only; the balances above are all-time.
 */
export function MoneyActivity({
  read,
  period,
  onPeriod,
  now = new Date(),
}: {
  read: ShopMoneyRead;
  period: MoneyPeriod;
  onPeriod: (period: MoneyPeriod) => void;
  now?: Date;
}) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [allJobs, setAllJobs] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  const history = useMemo(
    () => read.history.filter((entry) => matchesHistoryFilter(entry, filter)),
    [read.history, filter],
  );
  const methodTotal = CLIENT_PAYMENT_METHODS.reduce(
    (sum, method) => sum + (read.paymentMethods[method] ?? 0),
    0,
  );
  const days = read.earningsByDay.slice(-7).reverse();
  const dayMax = Math.max(1, ...days.map((d) => d.amountMinor));
  const periodWord = period === "week" ? "this week" : "this month";
  const jobs = allJobs ? read.jobs : read.jobs.slice(0, JOBS_SHOWN);
  const historyShown = allHistory ? history : history.slice(0, HISTORY_SHOWN);

  return (
    <section className="flex flex-col gap-4" aria-label="Money activity" data-testid="money-activity">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 text-text-primary m-0">Activity</h2>
        <ToggleGroup
          value={[period]}
          onValueChange={(values) => {
            const next = values[0] as MoneyPeriod | undefined;
            if (next) onPeriod(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="Show the last week or month"
        >
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value}>
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2" aria-labelledby="money-methods">
          <h3 id="money-methods" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            How clients paid
          </h3>
          {methodTotal ? (
            <ul className="gg-card m-0 flex list-none flex-col gap-3" data-testid="client-payment-methods">
              {CLIENT_PAYMENT_METHODS.filter((m) => read.paymentMethods[m]).map((method) => {
                const count = read.paymentMethods[method] ?? 0;
                return (
                  <li key={method} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-body text-text-primary">{paymentMethodLabel(method)}</span>
                      <span className="text-body text-text-secondary tabular-nums">
                        {count === 1 ? "1 job" : `${count} jobs`}
                      </span>
                    </div>
                    <Bar fraction={count / methodTotal} />
                  </li>
                );
              })}
              {read.paymentMethods.voucher ? (
                <li className="text-caption text-text-muted">
                  A job paid partly by voucher counts under both.
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-body text-text-muted m-0">No jobs {periodWord} yet.</p>
          )}
        </section>

        {days.length ? (
          <section className="flex flex-col gap-2" aria-labelledby="money-days">
            <h3 id="money-days" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              Earned per day
            </h3>
            <ul className="gg-card m-0 flex list-none flex-col gap-2" data-testid="earned-per-day">
              {days.map(({ day, amountMinor }) => (
                <li key={day} className="flex items-center gap-3">
                  <span className="text-caption text-text-muted w-24 shrink-0">{shortDay(day)}</span>
                  <div className="min-w-0 flex-1">
                    <Bar fraction={Math.max(0, amountMinor) / dayMax} />
                  </div>
                  <span className="text-body text-text-primary w-28 shrink-0 text-right tabular-nums">
                    {formatPhp(amountMinor)}
                  </span>
                </li>
              ))}
              {read.earningsByDay.length > 7 ? (
                <li className="text-caption text-text-muted">The last 7 days with earnings.</li>
              ) : null}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {read.jobs.length ? (
          <section className="flex flex-col gap-2" aria-labelledby="money-jobs">
            <h3 id="money-jobs" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              Pay by job
            </h3>
            <ul className="gg-card m-0 flex list-none flex-col p-0" data-testid="pay-by-job">
              {jobs.map((job) => {
                const paid = clientPaymentLine(job.clientPayment);
                const tag = settlementLabel(job.clientPayment);
                const bonus = job.bonus && job.bonus.amountMinor > 0 ? job.bonus.amountMinor : 0;
                const ref = orderReference(job.orderId) ?? "Job";
                return (
                  <li key={job.orderId} className="border-outline-subtle border-b last:border-b-0">
                    <Link
                      href={`/supplier/jobs/${job.orderId}`}
                      aria-label={`Open job ${ref}`}
                      className="hover:bg-surface-variant flex min-h-11 flex-col gap-1 px-4 py-3"
                      data-testid={`money-job-${job.orderId}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-body text-text-primary min-w-0" style={{ fontFamily: "var(--font-medium)" }}>
                          {ref}
                        </span>
                        {job.shopPayMinor != null ? (
                          <span className="text-body text-text-primary tabular-nums" style={{ fontFamily: "var(--font-medium)" }}>
                            {formatPhp(job.shopPayMinor)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-caption text-text-muted min-w-0">
                          {[paid ?? "Payment not recorded", whenLabel(job.createdAt, now)].filter(Boolean).join(" · ")}
                        </span>
                        {tag ? <span className="text-caption text-text-secondary shrink-0">{tag}</span> : null}
                      </span>
                      {bonus ? (
                        <span className="text-caption text-success" style={{ fontFamily: "var(--font-medium)" }}>
                          +{formatPhp(bonus)} launch bonus
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {read.jobs.length > JOBS_SHOWN ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-text-muted m-0">
                  {allJobs
                    ? `All ${read.jobs.length} jobs ${periodWord}.`
                    : `The ${JOBS_SHOWN} newest of ${read.jobs.length} jobs ${periodWord}.`}
                </p>
                <Button variant="ghost" onClick={() => setAllJobs((v) => !v)}>
                  {allJobs ? "Show fewer" : `Show all ${read.jobs.length}`}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-2" aria-labelledby="money-history">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="money-history" className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              History
            </h3>
            <ToggleGroup
              value={[filter]}
              onValueChange={(values) => {
                const next = values[0] as HistoryFilter | undefined;
                if (next) {
                  setFilter(next);
                  setAllHistory(false);
                }
              }}
              variant="outline"
              spacing={0}
              aria-label="Filter the history"
            >
              {HISTORY_FILTERS.map((f) => (
                <ToggleGroupItem key={f.value} value={f.value}>
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {history.length ? (
            <ul className="gg-card m-0 flex list-none flex-col gap-3" data-testid="money-history">
              {historyShown.map((entry) => {
                const amount = historyAmount(entry);
                const ref = orderReference(entry.orderId);
                return (
                  <li
                    key={entry.id}
                    className="border-outline-subtle flex items-baseline justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-body text-text-primary">{historyLabel(entry)}</span>
                      <span className="text-caption text-text-muted">
                        {[ref, whenLabel(entry.at, now), entry.reference ? `ref ${entry.reference}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className={`text-body shrink-0 tabular-nums ${TONE_CLASS[amount.tone]}`}
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {amount.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body text-text-muted m-0">Nothing here {periodWord}.</p>
          )}
          {history.length > HISTORY_SHOWN ? (
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setAllHistory((v) => !v)}>
                {allHistory ? "Show fewer" : `Show all ${history.length}`}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

/** A plain bar: neutral fill on the variant surface, never a colour code. */
function Bar({ fraction }: { fraction: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-pill bg-surface-variant" aria-hidden>
      <div className="h-2 rounded-pill bg-text-primary/70" style={{ width: `${Math.min(1, fraction) * 100}%` }} />
    </div>
  );
}
